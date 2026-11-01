import cors from 'cors';
import express from 'express';
import analysisRoutes from './features/analysis/analysis.routes.js';
import healthRoutes from './features/health/health.routes.js';
import { createWebhookHandler } from './features/pullRequest/pullRequest.webhook.js';

const app = express();

app.use(cors());
// HMAC covers the original bytes; JSON middleware must not consume them first.
app.post('/api/webhooks/github', express.raw({ type: 'application/json', limit: '1mb' }), createWebhookHandler());
app.use('/api/webhooks/github', (error, request, response, next) => {
  response.status(error.type === 'entity.too.large' ? 413 : 400).json({ message: 'Invalid or oversized webhook body.' });
});
app.use(express.json());
app.use('/api/health', healthRoutes);
app.use('/api/analyses', analysisRoutes);

export default app;
