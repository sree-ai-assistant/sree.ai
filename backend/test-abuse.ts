
import { checkForAbuse, type IdentitySignals, hashIp } from './src/services/abuse.service';
import { supabaseAdmin } from './src/lib/supabase';

async function testEscalation() {
  const testIp = '3.0.0.1'; // AWS IP
  const testFp = 'test-fingerprint-' + Date.now();
  const testAnonId = 'test-anon-' + Date.now();
  
  const signals: IdentitySignals = {
    rawIp: testIp,
    fingerprintHash: testFp,
    anonId: testAnonId,
  };

  console.log('--- Initial Check (Datacenter IP expected) ---');
  let result = await checkForAbuse(signals);
  console.log('Result:', result.action, 'Severity:', result.severity);
  console.log('Flags:', result.flags.map(f => f.flag_type));

  console.log('\n--- Simulating Rapid Requests (Level 1-2 expected) ---');
  // Trigger rapid requests (Threshold is 30)
  for (let i = 0; i < 35; i++) {
    result = await checkForAbuse(signals);
  }
  console.log('Result:', result.action, 'Severity:', result.severity);
  console.log('Flags:', result.flags.map(f => ({ type: f.flag_type, severity: f.severity })));

  console.log('\n--- Simulating Another Burst (Level 3 expected) ---');
  // Trigger rapid requests again
  for (let i = 0; i < 35; i++) {
    result = await checkForAbuse(signals);
  }
  console.log('Result:', result.action, 'Severity:', result.severity);
  
  console.log('\n--- Simulating Cookie Reset (Level 4+ expected) ---');
  for (let i = 0; i < 10; i++) {
    await checkForAbuse({
      ...signals,
      anonId: 'test-anon-new-' + i
    });
  }
  result = await checkForAbuse(signals);
  console.log('Result:', result.action, 'Severity:', result.severity);

  // Cleanup: Resolve flags
  console.log('\n--- Resolving Flags ---');
  const { data, error } = await supabaseAdmin
    .from('abuse_flags')
    .update({ resolved_at: new Date().toISOString(), resolved_by: 'admin' })
    .is('resolved_at', null)
    .or(`fingerprint_hash.eq.${testFp},ip_hash.eq.${hashIp(testIp)}`);
  
  if (error) console.error('Cleanup error:', error);
  else console.log('Cleanup successful');
}

testEscalation().catch(console.error);
