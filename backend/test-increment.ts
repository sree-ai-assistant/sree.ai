import * as dotenv from 'dotenv';
import path from 'path';
// Load environment variables from backend/.env
dotenv.config({ path: path.join(__dirname, '.env') });

import { checkAndIncrementUsage } from './src/services/usage.service';

async function runTest() {
  console.log('Testing checkAndIncrementUsage from Node...');
  
  const identity = {
    type: 'anonymous' as const,
    anonId: 'test-node-anon-' + Date.now(),
    tier: 'free' as const
  };
  
  console.log('Using identity:', identity);
  
  const result = await checkAndIncrementUsage(identity, 'chat');
  console.log('Result:', result);
}

runTest().catch(console.error);
