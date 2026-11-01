import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import analysisRoutes from './features/analysis/analysis.routes.js';
import healthRoutes from './features/health/health.routes.js';
import { createWebhookHandler } from './features/pullRequest/pullRequest.webhook.js';
import { createGitHubRoutes, requireSession } from './features/pullRequest/github.app.js';

const app = express();
app.use('/api', (request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });

app.use(cors({ origin: process.env.APP_ORIGIN || 'http://localhost:5173', credentials: true }));
// HMAC covers the original bytes; JSON middleware must not consume them first.
app.post('/api/webhooks/github', (request, response, next) => {
  if (process.env.NODE_ENV === 'production' && (!process.env.GITHUB_APP_ID || mongoose.connection.readyState !== 1)) return response.status(503).json({ message: 'Webhook storage or App configuration is unavailable.' });
  next();
}, express.raw({ type: 'application/json', limit: '1mb' }), createWebhookHandler());
app.use('/api/webhooks/github', (error, request, response, next) => {
  response.status(error.type === 'entity.too.large' ? 413 : 400).json({ message: 'Invalid or oversized webhook body.' });
});
app.use(express.json());
app.use('/api/health', healthRoutes);
app.use('/api/github', createGitHubRoutes());
app.use('/api/analyses', requireSession, (request, response, next) => {
  if (process.env.NODE_ENV === 'production' && mongoose.connection.readyState !== 1) return response.status(503).json({ message: 'Persistent report storage is unavailable.' });
  next();
}, analysisRoutes);
app.use('/api', (request, response) => response.status(404).json({ message: 'API endpoint not found.' }));
const clientDirectory = fileURLToPath(new URL('../../client/dist/', import.meta.url));
app.use(express.static(clientDirectory));
app.get(/^(?!\/api(?:\/|$)).*/, (request, response, next) => {
  response.sendFile('index.html', { root: clientDirectory }, error => {
    if (error) response.status(404).type('text').send('Frontend build not found. Run npm run build first.');
  });
});
app.use((error, request, response, next) => {
  if (response.headersSent) return response.end();
  response.status(error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500).json({ message: 'Request could not be completed.' });
});

export default app;
