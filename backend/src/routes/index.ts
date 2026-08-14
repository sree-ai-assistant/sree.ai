import { Router } from 'express';
import healthRoutes from './health.routes';
import userRoutes from './user.routes';
import aiRoutes from './ai.routes';
import modelsRoutes from './models.routes';
import paymentRoutes from './payment.routes';
import featureRequestRoutes from './featureRequest.routes';
import configRoutes from './config.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/user', userRoutes);
router.use('/ai', aiRoutes);
router.use('/models', modelsRoutes);
router.use('/payment', paymentRoutes);
router.use('/feature-requests', featureRequestRoutes);
router.use('/config', configRoutes);
router.use('/stt', (req, res, next) => {
  req.url = '/stt' + req.url;
  aiRoutes(req, res, next);
});

export default router;

