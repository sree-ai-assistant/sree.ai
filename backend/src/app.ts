import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { telemetryService } from './services/telemetry.service';
import { createSecureLogVaultRouter } from './routes/secureLogVault.routes';

const app = express();

// Trust reverse proxy (Nginx & Cloudflare) for loopback client IP resolution (CWE-307)
app.set('trust proxy', 'loopback');

// Hardened Ops Vault & Real-Time Log Observability Path
const logVaultPath = process.env.LOG_VAULT_PATH || '/ops-log-vault-9x2k';

// Middlewares
app.use(helmet({ contentSecurityPolicy: false }));

// Ultra-low overhead telemetry request recording (< 1 KB ring buffer)
// Excludes internal ops vault polling and health checks from user traffic counts
app.use((req, _res, next) => {
  if (!req.originalUrl.startsWith(logVaultPath) && !req.originalUrl.startsWith('/api/health')) {
    telemetryService.recordRequest();
  }
  next();
});
app.use(cors({
  origin: (origin, callback) => {
    // Split FRONTEND_URL by comma if it exists to allow multiple domains
    const envOrigins = process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map(u => u.trim())
      : [];

    // List of allowed origins
    const allowedOrigins = [
      ...envOrigins,
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174'
    ].filter(Boolean);

    // In development, we're more permissive
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (!origin || allowedOrigins.includes(origin) || isDevelopment) {
      // If allowed, return the actual origin instead of true
      // This ensures Access-Control-Allow-Origin matches the request
      callback(null, origin || true);
    } else {
      console.warn(`[CORS] Blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  exposedHeaders: ['X-Restored-Anon-Id'],
}));
// Skip logging ops vault telemetry & tail polling to prevent console flooding and log loops
app.use(morgan('dev', {
  skip: (req) => req.originalUrl.startsWith(logVaultPath)
}));
app.use(cookieParser());
app.use(express.json({
  limit: '50mb',
  // Preserve raw body for Razorpay webhook signature verification
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString();
  },
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Hardened Ops Vault & Real-Time Log Observability
app.use(logVaultPath, createSecureLogVaultRouter(logVaultPath));

// Routes
app.use('/api', routes);

// Error Handler
app.use(errorHandler);

export default app;
