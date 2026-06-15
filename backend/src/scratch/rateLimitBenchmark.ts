import axios from 'axios';
import crypto from 'crypto';

// Help / usage documentation
const showHelp = () => {
  console.log(`
🚀 Sree AI Chat Rate Limit & Concurrency Benchmark
=================================================

Usage:
  npx ts-node src/scratch/rateLimitBenchmark.ts [options]

Options:
  --url=<url>          Target chat URL (default: http://localhost:5000/api/ai/chat)
  --token=<token>      Auth Bearer Token to test authenticated limits (optional)
  --concurrency=<num>  Number of concurrent requests to run at once (default: 5)
  --total=<num>        Total number of requests to execute (default: 20)
  --model=<model>      AI Model to query (default: meta/llama-3.1-70b-instruct)
  --msg=<message>      Test query content (default: "Hello, tell me a 1-sentence joke.")
  --anon               Force testing as a new anonymous user per request (generates unique fingerprints)

Examples:
  # Test with default anonymous limits (limits should hit after 3 requests)
  npx ts-node src/scratch/rateLimitBenchmark.ts --total 10 --concurrency 2

  # Test authenticated limits (e.g. Starter tier allows 10/min, Pro allows 20/min)
  npx ts-node src/scratch/rateLimitBenchmark.ts --token="your-jwt-token" --total 30 --concurrency 5

  # Run high concurrency load test
  npx ts-node src/scratch/rateLimitBenchmark.ts --total 50 --concurrency 15
`);
};

// Parse command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

const getArgValue = (flag: string, defaultValue: string): string => {
  const arg = args.find(a => a.startsWith(flag));
  if (arg) {
    if (arg.includes('=')) {
      return arg.split('=')[1] ?? defaultValue;
    }
    const index = args.indexOf(arg);
    return args[index + 1] ?? defaultValue;
  }
  return defaultValue;
};

const URL = getArgValue('--url', 'http://localhost:5000/api/ai/chat');
const AUTH_TOKEN = getArgValue('--token', '');
const CONCURRENCY = parseInt(getArgValue('--concurrency', '5'), 10);
const TOTAL_REQUESTS = parseInt(getArgValue('--total', '20'), 10);
const MODEL = getArgValue('--model', 'meta/llama-3.1-70b-instruct');
const MESSAGE = getArgValue('--msg', 'Hello, tell me a 1-sentence joke.');
const FORCE_ANON = args.includes('--anon');

interface RequestResult {
  id: number;
  status: number;
  latencyMs: number;
  success: boolean;
  errorMsg?: string;
  responseSnippet?: string;
  rateLimitInfo?: any;
}

async function sendChatRequest(id: number, headers: Record<string, string>): Promise<RequestResult> {
  const startTime = Date.now();
  const payload = {
    model: MODEL,
    messages: [{ role: 'user', content: MESSAGE }],
    conversationId: crypto.randomUUID(),
    messageId: crypto.randomUUID()
  };

  try {
    const response = await axios.post(URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      responseType: 'stream',
      timeout: 15000 // 15s timeout
    });

    const latencyMs = Date.now() - startTime;

    // Since it's a stream, read the first chunk to ensure connection was accepted, then cancel stream
    const result = await new Promise<{ success: boolean; snippet: string }>((resolve, reject) => {
      let snippet = '';
      let resolved = false;

      response.data.on('data', (chunk: Buffer) => {
        if (!resolved) {
          resolved = true;
          snippet = chunk.toString().slice(0, 100);
          response.data.destroy(); // Cancel stream
          resolve({ success: true, snippet });
        }
      });

      response.data.on('end', () => {
        if (!resolved) {
          resolve({ success: true, snippet: '[empty response]' });
        }
      });

      response.data.on('error', (err: any) => {
        if (!resolved) {
          reject(err);
        }
      });
    });

    return {
      id,
      status: response.status,
      latencyMs,
      success: true,
      responseSnippet: result.snippet
    };

  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    let status = 500;
    let errorMsg = error.message;
    let rateLimitInfo = null;

    if (error.response) {
      status = error.response.status;

      // Parse error body from stream
      let errorBody = '';
      if (error.response.data && typeof error.response.data.on === 'function') {
        errorBody = await new Promise<string>((resolve) => {
          let body = '';
          error.response.data.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          error.response.data.on('end', () => resolve(body));
          error.response.data.on('error', () => resolve(''));
        });
      }

      try {
        const parsed = JSON.parse(errorBody);
        errorMsg = parsed.message || errorBody;
        if (parsed.code === 'RATE_LIMIT_EXCEEDED') {
          rateLimitInfo = parsed;
        }
      } catch {
        errorMsg = errorBody || error.message;
      }
    }

    return {
      id,
      status,
      latencyMs,
      success: false,
      errorMsg,
      rateLimitInfo
    };
  }
}

async function runBenchmark() {
  console.log(`
🏋️ Starting Sree AI Chat Rate Limit Benchmark
=============================================
Target URL:        ${URL}
Model:             ${MODEL}
Total Requests:    ${TOTAL_REQUESTS}
Max Concurrency:   ${CONCURRENCY}
Auth Mode:         ${AUTH_TOKEN ? 'Bearer Token supplied' : FORCE_ANON ? 'Multiple unique Anonymous users' : 'Single Anonymous user session'}
`);

  const results: RequestResult[] = [];
  const activePromises = new Set<Promise<any>>();

  // Setup persistent headers if we are using a single anonymous session or single auth token
  const defaultFingerprint = crypto.createHash('sha256').update(Math.random().toString()).digest('hex');
  const defaultAnonId = crypto.randomUUID();

  let requestCounter = 0;

  while (requestCounter < TOTAL_REQUESTS) {
    // Fill active queue up to CONCURRENCY
    while (activePromises.size < CONCURRENCY && requestCounter < TOTAL_REQUESTS) {
      requestCounter++;
      const id = requestCounter;

      const headers: Record<string, string> = {};
      if (AUTH_TOKEN) {
        headers['Authorization'] = AUTH_TOKEN.startsWith('Bearer ') ? AUTH_TOKEN : `Bearer ${AUTH_TOKEN}`;
      } else {
        // Handle anonymous fingerprints
        const fp = FORCE_ANON
          ? crypto.createHash('sha256').update(Math.random().toString()).digest('hex')
          : defaultFingerprint;
        const anonId = FORCE_ANON ? crypto.randomUUID() : defaultAnonId;

        headers['x-fingerprint'] = fp;
        headers['x-anon-id'] = anonId;
      }

      const promise = sendChatRequest(id, headers).then(res => {
        results.push(res);
        activePromises.delete(promise);

        // Print request completion status log
        const logSymbol = res.success ? '✅' : res.status === 429 ? '⚠️' : '❌';
        const latencyStr = `${res.latencyMs}ms`;
        if (res.success) {
          console.log(`[Req #${res.id}] ${logSymbol} Status: ${res.status} | Latency: ${latencyStr} | SSE start: "${res.responseSnippet?.replace(/\n/g, '\\n')}"`);
        } else {
          console.log(`[Req #${res.id}] ${logSymbol} Status: ${res.status} | Latency: ${latencyStr} | Error: ${res.errorMsg}`);
        }
      });

      activePromises.add(promise);
    }

    // Wait for at least one request to finish before spawning next in queue
    if (activePromises.size > 0) {
      await Promise.race(activePromises);
    }
  }

  // Wait for all remaining active promises to complete
  await Promise.all(activePromises);

  // Generate Benchmark Report
  const total = results.length;
  const successful = results.filter(r => r.success).length;
  const rateLimited = results.filter(r => r.status === 429).length;
  const otherErrors = total - successful - rateLimited;

  const latencies = results.map(r => r.latencyMs);
  const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / total : 0;
  const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;

  // Find when rate limit first hit
  const first429Req = results.find(r => r.status === 429);
  const firstRateLimitMessage = first429Req?.errorMsg || 'None';

  console.log(`
📊 Benchmark Complete
=============================================
Total Requests Run:      ${total}
Successful (200 OK):     ${successful} (${((successful / total) * 100).toFixed(1)}%)
Rate Limited (429):      ${rateLimited} (${((rateLimited / total) * 100).toFixed(1)}%)
Other Errors:            ${otherErrors} (${((otherErrors / total) * 100).toFixed(1)}%)

Latency Stats:
  Average Latency:       ${avgLatency.toFixed(1)}ms
  Minimum Latency:       ${minLatency}ms
  Maximum Latency:       ${maxLatency}ms

Rate Limiting Details:
  First 429 Hit At:      Req #${first429Req ? first429Req.id : 'N/A (Limit not reached)'}
  Rate Limit Reason:     ${firstRateLimitMessage}
`);
}

runBenchmark().catch(err => {
  console.error('Fatal Benchmark Error:', err);
  process.exit(1);
});
