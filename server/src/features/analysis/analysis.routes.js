import { Router } from 'express';
import { createAnalysis, getAnalyses, getAnalysis, setFindingFeedback } from './analysis.controller.js';

const router = Router();

router.get('/', getAnalyses);
router.get('/:analysisId', getAnalysis);
router.post('/', createAnalysis);
router.put('/:analysisId/findings/:findingIndex/feedback', setFindingFeedback);

export default router;
