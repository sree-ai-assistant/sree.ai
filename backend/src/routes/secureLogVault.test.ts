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
  revokeSessionToken,
  isTokenRevoked,
  clearRevocationList,
  getSafeLogPath,
  computeDateBoundaries,
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  getVaultConfig,
  getVaultSessionSecret,
  getClientIp,
} from './secureLogVault.routes';
import { escapeHtml, renderLoginHtml } from './secureLogVault.template';

describe('Secure Log Vault - Security & Hardening Tests', () => {
  const testIp = '198.51.100.42';

  beforeEach(() => {
    clearRateLimit(testIp);
    clearRateLimit('127.0.0.1');
    clearRateLimit('::ffff:127.0.0.1');
    clearRevocationList();
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

    async function fetchLoginCsrf() {
      const res = await request(app).get(`${vaultPath}/login`);
      const rawCookies = res.header['set-cookie'];
      const cookies = Array.isArray(rawCookies) ? rawCookies : (rawCookies ? [rawCookies] : []);
      const csrfCookie = cookies.find((c: string) => c.startsWith('sree_log_csrf='));
      const match = res.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = match ? match[1] : '';
      return { csrfCookie, csrfToken };
    }

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
      const { csrfCookie, csrfToken } = await fetchLoginCsrf();
      expect(csrfCookie).toBeDefined();

      const res = await request(app)
        .post(`${vaultPath}/login`)
        .set('Cookie', [csrfCookie!])
        .send({
          username: process.env.LOG_VAULT_USER || 'sree_admin',
          password: process.env.LOG_VAULT_PASS || 'Sree_Admin_Vault_2026!',
          _csrf: csrfToken
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

    it('clears cookie, revokes session token, and redirects on logout', async () => {
      const token = createSessionToken('sree_admin');
      const res = await request(app)
        .get(`${vaultPath}/logout`)
        .set('Cookie', [`sree_log_session=${token}`]);

      expect(res.status).toBe(302);
      expect(res.header.location).toBe(`${vaultPath}/login`);
      expect(res.header['set-cookie']?.[0]).toContain('sree_log_session=;');
      expect(isTokenRevoked(token)).toBe(true);
    });

    it('isolates cookie path to basePath on login and logout', async () => {
      const { csrfCookie, csrfToken } = await fetchLoginCsrf();
      const res = await request(app)
        .post(`${vaultPath}/login`)
        .set('Cookie', [csrfCookie!])
        .send({
          username: process.env.LOG_VAULT_USER || 'sree_admin',
          password: process.env.LOG_VAULT_PASS || 'Sree_Admin_Vault_2026!',
          _csrf: csrfToken
        });
      expect(res.header['set-cookie']?.[0]).toContain(`Path=${vaultPath}`);

      const logoutRes = await request(app).get(`${vaultPath}/logout`);
      expect(logoutRes.header['set-cookie']?.[0]).toContain(`Path=${vaultPath}`);
    });

    it('sets hardened Content-Security-Policy and security headers', async () => {
      const res = await request(app).get(`${vaultPath}/login`);
      const csp = res.header['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(res.header['x-content-type-options']).toBe('nosniff');
      expect(res.header['x-frame-options']).toBe('DENY');
      expect(res.header['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('enforces mandatory CSRF validation on POST /login', async () => {
      const { csrfCookie } = await fetchLoginCsrf();

      // Attempt 1: Tampered CSRF token
      const failedRes1 = await request(app)
        .post(`${vaultPath}/login`)
        .set('Cookie', [csrfCookie!])
        .send({
          username: 'sree_admin',
          password: 'Sree_Admin_Vault_2026!',
          _csrf: 'tampered_csrf_token_12345'
        });
      expect(failedRes1.status).toBe(403);
      expect(failedRes1.text).toContain('Invalid, missing, or expired CSRF security token');

      // Attempt 2: Completely omitted CSRF token & cookie
      const failedRes2 = await request(app)
        .post(`${vaultPath}/login`)
        .send({
          username: 'sree_admin',
          password: 'Sree_Admin_Vault_2026!'
        });
      expect(failedRes2.status).toBe(403);
      expect(failedRes2.text).toContain('Invalid, missing, or expired CSRF security token');
    });
  });

  describe('OWASP Penetration Testing: Login Bypass & Attack Mitigation', () => {
    const vaultPath = process.env.LOG_VAULT_PATH || '/ops-log-vault-9x2k';

    async function fetchValidCsrf() {
      const res = await request(app).get(`${vaultPath}/login`);
      const rawCookies = res.header['set-cookie'];
      const cookies = Array.isArray(rawCookies) ? rawCookies : (rawCookies ? [rawCookies] : []);
      const csrfCookie = cookies.find((c: string) => c.startsWith('sree_log_csrf='));
      const match = res.text.match(/name="_csrf"\s+value="([^"]+)"/);
      return { csrfCookie: csrfCookie!, csrfToken: match ? match[1] : '' };
    }

    it('blocks SQL injection login bypass attempts (e.g. "admin\' OR \'1\'=\'1")', async () => {
      const { csrfCookie, csrfToken } = await fetchValidCsrf();
      const res = await request(app)
        .post(`${vaultPath}/login`)
        .set('Cookie', [csrfCookie])
        .send({
          username: "admin' OR '1'='1",
          password: "' OR '1'='1",
          _csrf: csrfToken
        });

      expect(res.status).toBe(401);
      expect(res.text).toContain('Invalid operator credentials');
    });

    it('blocks NoSQL injection object payload bypass attempts', async () => {
      const { csrfCookie, csrfToken } = await fetchValidCsrf();
      const res = await request(app)
        .post(`${vaultPath}/login`)
        .set('Cookie', [csrfCookie])
        .send({
          username: { $ne: null },
          password: { $gt: '' },
          _csrf: csrfToken
        });

      expect(res.status).toBe(401);
      expect(res.text).toContain('Invalid operator credentials');
    });

    it('blocks Parameter Pollution / Array Confusion bypass attempts', async () => {
      const { csrfCookie, csrfToken } = await fetchValidCsrf();
      const res = await request(app)
        .post(`${vaultPath}/login`)
        .set('Cookie', [csrfCookie])
        .send({
          username: ['sree_admin', 'sree_admin'],
          password: ['Sree_Admin_Vault_2026!'],
          _csrf: csrfToken
        });

      expect(res.status).toBe(401);
      expect(res.text).toContain('Invalid operator credentials');
    });

    it('blocks Buffer Overrun and ReDoS credential attempts (>128 chars user / >256 chars pass)', async () => {
      const { csrfCookie, csrfToken } = await fetchValidCsrf();
      const hugeUsername = 'sree_admin_' + 'a'.repeat(200);
      const hugePassword = 'x'.repeat(500);

      const res = await request(app)
        .post(`${vaultPath}/login`)
        .set('Cookie', [csrfCookie])
        .send({
          username: hugeUsername,
          password: hugePassword,
          _csrf: csrfToken
        });

      expect(res.status).toBe(401);
      expect(res.text).toContain('Invalid operator credentials');
    });

    it('blocks whitespace-only credentials', async () => {
      const { csrfCookie, csrfToken } = await fetchValidCsrf();
      const res = await request(app)
        .post(`${vaultPath}/login`)
        .set('Cookie', [csrfCookie])
        .send({
          username: '     ',
          password: '     ',
          _csrf: csrfToken
        });

      expect(res.status).toBe(401);
      expect(res.text).toContain('Invalid operator credentials');
    });

    it('prevents Post-Logout Session Replay Attack (ASVS V3.3 Token Invalidation)', async () => {
      // 1. Operator logs in successfully
      const { csrfCookie, csrfToken } = await fetchValidCsrf();
      const loginRes = await request(app)
        .post(`${vaultPath}/login`)
        .set('Cookie', [csrfCookie])
        .send({
          username: 'sree_admin',
          password: 'Sree_Admin_Vault_2026!',
          _csrf: csrfToken
        });

      expect(loginRes.status).toBe(302);
      const rawCookies = loginRes.header['set-cookie'];
      const sessionCookie = (Array.isArray(rawCookies) ? rawCookies : [rawCookies])
        .find((c: string) => c.startsWith('sree_log_session='));
      expect(sessionCookie).toBeDefined();

      // Extract raw token string
      const tokenMatch = sessionCookie.match(/sree_log_session=([^;]+)/);
      const token = tokenMatch ? tokenMatch[1] : '';

      // 2. Token works initially
      const authRes1 = await request(app)
        .get(`${vaultPath}/api/metrics`)
        .set('Cookie', [`sree_log_session=${token}`]);
      expect(authRes1.status).toBe(200);

      // 3. Operator logs out
      const logoutRes = await request(app)
        .get(`${vaultPath}/logout`)
        .set('Cookie', [`sree_log_session=${token}`]);
      expect(logoutRes.status).toBe(302);

      // 4. Attacker attempts to replay the stolen session token after logout
      const replayRes = await request(app)
        .get(`${vaultPath}/api/metrics`)
        .set('Cookie', [`sree_log_session=${token}`]);
      expect(replayRes.status).toBe(401);
      expect(replayRes.body.error).toContain('Unauthorized');
    });

    it('neutralizes dual-stack IPv6-mapped IPv4 rate limit evasion (::ffff:IP)', () => {
      const mockReq = {
        ip: '::ffff:203.0.113.88',
        socket: { remoteAddress: '::ffff:203.0.113.88' }
      } as any;
      expect(getClientIp(mockReq)).toBe('203.0.113.88');
    });

    it('neutralizes null-byte (%00) and slash manipulations in log paths', () => {
      expect(getSafeLogPath('out.log\0.png')).toBeNull();
      expect(getSafeLogPath('out.log%00.png')).toBeNull();
      expect(getSafeLogPath('out%2flog')).toBeNull();
      expect(getSafeLogPath('..\\out.log')).toBeNull();
    });
  });

  describe('OWASP CWE-79: HTML & XSS Neutralization', () => {
    it('escapes dangerous HTML characters in escapeHtml helper', () => {
      expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(escapeHtml('"test" & \'value\'')).toBe('&quot;test&quot; &amp; &#39;value&#39;');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('neutralizes XSS payloads in renderLoginHtml error display', () => {
      const xssPayload = '<img src=x onerror=alert("pwned")>';
      const html = renderLoginHtml({ basePath: '/ops', error: xssPayload });
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img src=x onerror=alert(&quot;pwned&quot;)&gt;');
    });

    it('renders CSRF hidden input in renderLoginHtml when token is provided', () => {
      const html = renderLoginHtml({ basePath: '/ops', csrfToken: 'sec_tok_999' });
      expect(html).toContain('name="_csrf" value="sec_tok_999"');
    });
  });

  describe('OWASP CWE-798: Secret Enforcement & Vault Configuration', () => {
    it('verifies that configured environment credentials are recognized', () => {
      const config = getVaultConfig();
      expect(config.isConfigured).toBe(true);
      expect(config.user).toBe('sree_admin');
    });

    it('throws when LOG_VAULT_SESSION_SECRET is empty', () => {
      const original = process.env.LOG_VAULT_SESSION_SECRET;
      delete process.env.LOG_VAULT_SESSION_SECRET;
      try {
        expect(() => getVaultSessionSecret()).toThrow('LOG_VAULT_SESSION_SECRET is not configured');
      } finally {
        process.env.LOG_VAULT_SESSION_SECRET = original;
      }
    });
  });

  describe('CWE-307: Client IP Resolution Anti-Spoofing', () => {
    it('prioritizes trusted req.ip over spoofed raw headers', () => {
      const mockReq = {
        ip: '203.0.113.195',
        headers: {
          'cf-connecting-ip': '1.1.1.1',
          'x-forwarded-for': '2.2.2.2'
        },
        socket: { remoteAddress: '127.0.0.1' }
      } as any;
      expect(getClientIp(mockReq)).toBe('203.0.113.195');
    });
  });
});
