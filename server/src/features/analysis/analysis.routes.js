import { Router } from 'express';
import { createAnalysis, getAnalyses, getAnalysis } from './analysis.controller.js';

const router = Router();

router.get('/', getAnalyses);
router.get('/:analysisId', getAnalysis);
router.post('/', createAnalysis);

export default router;