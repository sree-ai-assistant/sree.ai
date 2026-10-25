import { describe, it, expect, beforeEach, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';
process.env.RAZORPAY_KEY_ID = 'rzp_test_mock';
process.env.RAZORPAY_KEY_SECRET = 'mock_secret';
process.env.LOG_VAULT_USER = 'sree_admin';
process.env.LOG_VAULT_PASS = 'Sree_Admin_Vault_2026!';
process.env.LOG_VAULT_SESSION_SECRET = 'test-session-secret-salt-32-chars';

vi.mock('razorpay', () => {
  return {
    default: class MockRazorpay {
      orders = { create: vi.fn() };
      payments = { fetch: vi.fn() };
    },
  };
});

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

import request from 'supertest';
import app from '../app';
import {
  redactSecrets,
  timingSafeEqual,
  createSessionToken,
  verifySessionToken,
  getSafeLogPath,
  computeDateBoundaries,
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
} from './secureLogVault.routes';

describe('Secure Log Vault - Security & Hardening Tests', () => {
  const testIp = '198.51.100.42';

  beforeEach(() => {
    clearRateLimit(testIp);
  });

  describe('OWASP CWE-532: 10-Signature Secret Scrubber', () => {
    it('redacts JWT tokens and Supabase service/anon keys', () => {
      const input = 'User auth with token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c in header';
      const scrubbed = redactSecrets(input);
      expect(scrubbed).not.toContain('eyJhbGciOiJIUzI1Ni');
      expect(scrubbed).toContain('[REDACTED_JWT]');
    });

    it('redacts Google Gemini API keys', () => {
      const input = 'API call error with key AIzaSyD1234567890123456789012345678901';
      const scrubbed = redactSecrets(input);
      expect(scrubbed).not.toContain('AIzaSyD1234567890123456789012345678901');
      expect(scrubbed).toContain('[REDACTED_GOOGLE_KEY]');
    });

    it('redacts OpenAI API keys', () => {
      const input = 'Connecting to model with sk-proj-123456789012345678901234567890123456';
      const scrubbed = redactSecrets(input);
      expect(scrubbed).not.toContain('sk-proj-123456789012345678901234567890123456');
      expect(scrubbed).toContain('[REDACTED_OPENAI_KEY]');
    });

    it('redacts Groq and NVIDIA API keys', () => {
      const groqInput = 'Groq client initialized: gsk_123456789012345678901234567890123456';
      const nvInput = 'NVIDIA Parakeet call with nvapi-123456789012345678901234567890123456';
      expect(redactSecrets(groqInput)).toContain('[REDACTED_GROQ_KEY]');
      expect(redactSecrets(nvInput)).toContain('[REDACTED_NVIDIA_KEY]');
    });

    it('redacts Razorpay payment gateway credentials', () => {
      const rzpInput = 'Order generated with id: rzp_test_12345678901234 and signature match';
      expect(redactSecrets(rzpInput)).toContain('[REDACTED_RAZORPAY]');
    });

    it('redacts Database connection strings containing user and passwords', () => {
      const dbInput = 'Connecting to postgres://postgres:SecretPassword123@db.supabase.co:5432/postgres';
      const scrubbed = redactSecrets(dbInput);
      expect(scrubbed).not.toContain('SecretPassword123');
      expect(scrubbed).toContain('[REDACTED_DB_URI]');
    });

    it('redacts Cloudflare R2 / S3 keys', () => {
      const r2Input = 'Storage failed: r2_secret="abcd1234efgh5678ijkl9012mnop3456"';
      expect(redactSecrets(r2Input)).toContain('[REDACTED_R2_KEY]');
    });

    it('redacts Bearer authorization headers', () => {
      const bearerInput = 'Authorization: Bearer ya29.a0AfH6SMCxyz1234567890abcdef';
      expect(redactSecrets(bearerInput)).toContain('Bearer [REDACTED_TOKEN]');
    });

    it('redacts generic password and secret key assignments', () => {
      const passInput = 'Config loaded: password: "superSecretPassword!"';
      expect(redactSecrets(passInput)).toContain('password: "[REDACTED]');
    });
  });

  describe('CWE-22: Path Traversal Mitigations & Directory Jailing', () => {
    it('rejects relative path traversal attacks', () => {
      expect(getSafeLogPath('../../../../etc/passwd')).toBeNull();
      expect(getSafeLogPath('..\\..\\..\\windows\\system32')).toBeNull();
      expect(getSafeLogPath('sub/out.log')).toBeNull();
    });

    it('rejects disallowed file extensions', () => {
      expect(getSafeLogPath('package.json')).toBeNull();
      expect(getSafeLogPath('.env')).toBeNull();
      expect(getSafeLogPath('server.js')).toBeNull();
    });

    it('accepts valid .log and .log.gz files', () => {
      expect(getSafeLogPath('out.log')).toMatch(/out\.log$/);
      expect(getSafeLogPath('err.log')).toMatch(/err\.log$/);
      expect(getSafeLogPath('out-2026-10-24.log.gz')).toMatch(/out-2026-10-24\.log\.gz$/);
    });
  });

  describe('CWE-307: Sliding-Window Rate Limiter', () => {
    it('allows 4 failed attempts without locking out', () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt(testIp);
      }
      const status = checkRateLimit(testIp);
      expect(status.limited).toBe(false);
    });

    it('locks out IP on the 5th failed attempt for 15 minutes', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt(testIp);
      }
      const status = checkRateLimit(testIp);
      expect(status.limited).toBe(true);
      expect(status.retryAfterSec).toBeGreaterThan(800); // ~900s
    });
  });

  describe('Stateless Session Tokens & Timing-Safe Comparison', () => {
    it('performs timing-safe string comparison correctly', () => {
      expect(timingSafeEqual('correct_pass', 'correct_pass')).toBe(true);
      expect(timingSafeEqual('correct_pass', 'wrong_pass')).toBe(false);
      expect(timingSafeEqual('', 'wrong_pass')).toBe(false);
    });

    it('creates and verifies valid session tokens', () => {
      const token = createSessionToken('sree_admin');
      const verified = verifySessionToken(token);
      expect(verified.valid).toBe(true);
      expect(verified.username).toBe('sree_admin');
    });

    it('rejects tampered or forged tokens', () => {
      const token = createSessionToken('sree_admin');
      const tampered = token.slice(0, -4) + 'abcd';
      const verified = verifySessionToken(tampered);
      expect(verified.valid).toBe(false);
    });
  });

  describe('Date & Date Range Boundary Computation', () => {
    it('computes correct boundaries for presets', () => {
      const allBoundaries = computeDateBoundaries({ preset: 'ALL' });
      expect(allBoundaries.startTime).toBe(0);
      expect(allBoundaries.endTime).toBe(Infinity);

      const oneHourBoundaries = computeDateBoundaries({ preset: '1H' });
      expect(oneHourBoundaries.endTime - oneHourBoundaries.startTime).toBeCloseTo(3600000, -3);

      const sevenDayBoundaries = computeDateBoundaries({ preset: '7D' });
      expect(sevenDayBoundaries.endTime - sevenDayBoundaries.startTime).toBeCloseTo(7 * 24 * 3600000, -3);
    });

    it('computes custom ISO date ranges', () => {
      const custom = computeDateBoundaries({
        startDate: '2026-10-25T08:00',
        endDate: '2026-10-25T18:00'
      });
      expect(custom.startTime).toBe(new Date('2026-10-25T08:00').getTime());
      expect(custom.endTime).toBe(new Date('2026-10-25T18:00').getTime());
    });
  });

  describe('HTTP Endpoints & Integration', () => {
    const vaultPath = process.env.LOG_VAULT_PATH || '/ops-log-vault-9x2k';

    it('redirects unauthenticated requests from root to login', async () => {
      const res = await request(app).get(vaultPath);
      expect(res.status).toBe(302);
      expect(res.header.location).toBe(`${vaultPath}/login`);
    });

    it('rejects unauthenticated API requests with 401 Unauthorized', async () => {
      const res = await request(app).get(`${vaultPath}/api/metrics`);
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('authenticates with valid operator credentials and sets secure cookie', async () => {
      const res = await request(app)
        .post(`${vaultPath}/login`)
        .send({
          username: process.env.LOG_VAULT_USER || 'sree_admin',
          password: process.env.LOG_VAULT_PASS || 'Sree_Admin_Vault_2026!'
        });

      expect(res.status).toBe(302);
      expect(res.header.location).toBe(vaultPath);
      expect(res.header['set-cookie']).toBeDefined();
      expect(res.header['set-cookie']?.[0]).toContain('sree_log_session=');
    });

    it('serves dashboard HTML with 200 OK when session cookie is provided', async () => {
      const token = createSessionToken('sree_admin');
      const res = await request(app)
        .get(vaultPath)
        .set('Cookie', [`sree_log_session=${token}`]);

      expect(res.status).toBe(200);
      expect(res.text).toContain('Sree AI');
      expect(res.text).toContain('Hardened Ops Vault');
      expect(res.text).toContain('Telemetry Time-Series');
    });

    it('returns real-time telemetry metrics JSON when authenticated', async () => {
      const token = createSessionToken('sree_admin');
      const res = await request(app)
        .get(`${vaultPath}/api/metrics`)
        .set('Cookie', [`sree_log_session=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.nodeVersion).toBe(process.version);
      expect(typeof res.body.uptimeSeconds).toBe('number');
      expect(typeof res.body.requestsPerMinute).toBe('number');
      expect(res.body.memory.rssMb).toBeGreaterThan(0);
      expect(res.body.cpu.cores).toBeGreaterThanOrEqual(1);
    });

    it('returns log lines JSON with date filters when authenticated', async () => {
      const token = createSessionToken('sree_admin');
      const res = await request(app)
        .get(`${vaultPath}/api/logs?file=combined&preset=ALL`)
        .set('Cookie', [`sree_log_session=${token}`]);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.lines)).toBe(true);
      expect(Array.isArray(res.body.files)).toBe(true);
    });

    it('clears cookie and redirects on logout', async () => {
      const res = await request(app).get(`${vaultPath}/logout`);
      expect(res.status).toBe(302);
      expect(res.header.location).toBe(`${vaultPath}/login`);
      expect(res.header['set-cookie']?.[0]).toContain('sree_log_session=;');
    });
  });
});
