import dotenv from 'dotenv';
dotenv.config();

import { apiKeyPool } from './services/apiKeyPool.service';
import { startObserverResetCron, stopObserverResetCron } from './services/modelObserver.service';
apiKeyPool.initialize();
startObserverResetCron();

import app from './app';
import { shutdownPostHog } from './services/posthog.service';
import { WebSocketServer } from 'ws';
import { handleLiveVoiceConnection } from './routes/live.routes';

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// ─── WebSocket Server for Gemini Live API Voice ──────────────────────
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

  if (pathname === '/api/live/voice') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log('[WebSocket] Live voice connection upgrade accepted');
      handleLiveVoiceConnection(ws, request);
    });
  } else {
    // Not a recognized WebSocket path — destroy the connection
    socket.destroy();
  }
});

console.log('[WebSocket] Live voice endpoint ready at /api/live/voice');

// Graceful shutdown — flush PostHog events before exit
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  await shutdownPostHog();
  stopObserverResetCron();

  // Close all active WebSocket connections
  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down');
  });

  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

