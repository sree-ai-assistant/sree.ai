import dotenv from 'dotenv';
dotenv.config();

import { apiKeyPool } from './services/apiKeyPool.service';
apiKeyPool.initialize();

import app from './app';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
