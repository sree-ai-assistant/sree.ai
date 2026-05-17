import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Middlewares
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // List of allowed origins
    const allowedOrigins = [
      process.env.FRONTEND_URL,
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
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api', routes);

// Error Handler
app.use(errorHandler);

export default app;
