import { Router } from 'express';
import { createAnalysis, getAnalyses, getAnalysis, setFindingFeedback, getJobStatus } from './analysis.controller.js';

const router = Router();
router.param('analysisId', (request, response, next, value) => {
  if (!/^[a-z\d_-]{1,128}$/i.test(value)) return response.status(400).json({ message: 'Invalid report ID.' });
  next();
});

router.get('/', getAnalyses);
router.get('/:analysisId', getAnalysis);
router.get('/:analysisId/job', getJobStatus);
router.post('/', createAnalysis);
router.put('/:analysisId/findings/:findingIndex/feedback', setFindingFeedback);

export default router;
