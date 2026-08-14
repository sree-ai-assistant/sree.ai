import dotenv from 'dotenv';
dotenv.config();

import { apiKeyPool } from './services/apiKeyPool.service';
apiKeyPool.initialize();

import app from './app';
import { shutdownPostHog } from './services/posthog.service';

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown — flush PostHog events before exit
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  await shutdownPostHog();
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

