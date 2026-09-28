import cors from 'cors';
import express from 'express';
import analysisRoutes from './features/analysis/analysis.routes.js';
import healthRoutes from './features/health/health.routes.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/health', healthRoutes);
app.use('/api/analyses', analysisRoutes);

export default app;