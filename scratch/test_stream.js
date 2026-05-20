const http = require('http');

const data = JSON.stringify({
  messages: [{ role: 'user', content: 'Explain color blue in 10 words' }],
  model: 'meta/llama-3.1-70b-instruct',
  mode: 'chat'
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/ai/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'X-Anon-Id': 'test-anon-id',
    'X-Fingerprint': 'test-fingerprint'
  }
};

console.log('Sending request to backend /api/ai/chat...');
const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  
  let chunkCount = 0;
  
  res.on('data', (chunk) => {
    chunkCount++;
    console.log(`\n--- CHUNK ${chunkCount} (${Date.now()}) ---`);
    console.log(chunk.toString());
  });

  res.on('end', () => {
    console.log('\n--- RESPONSE END ---');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
