import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import zlib from 'zlib';
import crypto from 'crypto';
import { telemetryService } from '../services/telemetry.service';
import { renderLoginHtml, renderDashboardHtml } from './secureLogVault.template';

export interface LogEntry {
  id: number;
  time: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  type: 'out' | 'err';
  service: string;
  content: string;
}

export interface DateFilterOptions {
  preset?: string;
  startDate?: string;
  endDate?: string;
}

// ─── Environment Configuration (OWASP CWE-798 Hardening) ─────────────
export function getVaultConfig(): { user: string | undefined; pass: string | undefined; isConfigured: boolean } {
  const user = process.env.LOG_VAULT_USER;
  const pass = process.env.LOG_VAULT_PASS;
  const secret = process.env.LOG_VAULT_SESSION_SECRET;
  const isConfigured = Boolean(user && pass && secret && secret.length >= 16);
  return { user, pass, isConfigured };
}

export function getVaultSessionSecret(): string {
  const secret = process.env.LOG_VAULT_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('LOG_VAULT_SESSION_SECRET is not configured or is shorter than 16 characters');
  }
  return secret;
}

// In production, logs are in /var/www/sree-ai/logs. Fallback to local ./logs in dev
const DEFAULT_LOG_DIR = fs.existsSync('/var/www/sree-ai/logs')
  ? '/var/www/sree-ai/logs'
  : path.resolve(process.cwd(), 'logs');
const LOG_DIR = process.env.LOG_DIR || DEFAULT_LOG_DIR;

// Ensure log directory exists so it doesn't fail on boot
if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOG_DIR, 'out.log'), `[${new Date().toISOString().replace('T', ' ').substring(0, 19)}] [INFO] [Server] Log vault initialized.\n`);
    fs.writeFileSync(path.join(LOG_DIR, 'err.log'), '');
  } catch {
    // Ignore error if read-only
  }
}

// ─── OWASP CWE-532 10-Signature Secret Scrubber ────────────────────────
export function redactSecrets(text: string): string {
  if (!text) return text;
  return text
    // 1. JWT Tokens & Supabase Anon/Service Keys (Header.Payload.Signature)
    .replace(/\beyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, '[REDACTED_JWT]')
    // 2. Google Gemini API Keys (starts with AIzaSy)
    .replace(/\bAIzaSy[A-Za-z0-9_-]{30,45}\b/g, '[REDACTED_GOOGLE_KEY]')
    // 3. OpenAI API Keys
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/g, '[REDACTED_OPENAI_KEY]')
    // 4. Groq API Keys
    .replace(/\bgsk_[A-Za-z0-9]{30,}\b/g, '[REDACTED_GROQ_KEY]')
    // 5. NVIDIA NIM API Keys
    .replace(/\bnvapi-[A-Za-z0-9_-]{30,}\b/g, '[REDACTED_NVIDIA_KEY]')
    // 6. Razorpay Keys & Secrets
    .replace(/\brzp_(?:test|live)_[A-Za-z0-9]{14,}\b/g, '[REDACTED_RAZORPAY]')
    // 7. Database Connection Strings
    .replace(/(?:postgres|postgresql|mongodb|mysql):\/\/[^:\s]+:[^@\s]+@[^\s"']+/gi, '[REDACTED_DB_URI]')
    // 8. Cloudflare R2 / AWS S3 Keys
    .replace(/(?:r2|s3|aws)_(?:key|secret)\s*[:=]\s*["']?[A-Za-z0-9/+=]{20,}["']?/gi, '[REDACTED_R2_KEY]')
    // 9. Authorization Bearer Headers
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1[REDACTED_TOKEN]')
    // 10. Generic Passwords & Secrets (avoiding overwriting tokens or already redacted tokens)
    .replace(/((?:password|secret|api[_-]?key|service_role)\s*[:=]\s*["']?)(?!\[REDACTED)[^\s"',}]+/gi, '$1[REDACTED]');
}

// ─── Constant-Time Comparison (Timing Attack Immune) ───────────────────
export function timingSafeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// ─── Session Management (Signed HMAC-SHA256 Stateless Cookie) ──────────
const COOKIE_NAME = 'sree_log_session';
const CSRF_COOKIE_NAME = 'sree_log_csrf';
const CSP_HEADER = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https://app.sreeai.qzz.io; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';";

export function createSessionToken(username: string): string {
  const secret = getVaultSessionSecret();
  const payload = Buffer.from(JSON.stringify({
    u: username,
    exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  })).toString('base64url');

  const signature = crypto.createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string): { valid: boolean; username?: string } {
  if (!token || typeof token !== 'string') return { valid: false };
  const secret = process.env.LOG_VAULT_SESSION_SECRET;
  if (!secret || secret.length < 16) return { valid: false };

  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false };

  const payload = parts[0];
  const signature = parts[1];
  if (!payload || !signature) return { valid: false };

  const expectedSignature = crypto.createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  if (!timingSafeEqual(signature, expectedSignature)) {
    return { valid: false };
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) {
      return { valid: false };
    }
    return { valid: true, username: data.u };
  } catch {
    return { valid: false };
  }
}

// ─── Sliding-Window Rate Limiter (CWE-307 & CWE-400 Protected) ────────
interface RateLimitRecord {
  attempts: number;
  lockedUntil: number;
  firstAttempt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const WINDOW_MS = 15 * 60 * 1000;

export function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

export function checkRateLimit(ip: string): { limited: boolean; retryAfterSec?: number } {
  const record = rateLimitMap.get(ip);
  if (!record) return { limited: false };

  const now = Date.now();
  if (record.lockedUntil > now) {
    return { limited: true, retryAfterSec: Math.ceil((record.lockedUntil - now) / 1000) };
  }

  if (now - record.firstAttempt > WINDOW_MS) {
    rateLimitMap.delete(ip);
    return { limited: false };
  }

  return { limited: false };
}

export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now - record.firstAttempt > WINDOW_MS) {
    rateLimitMap.set(ip, { attempts: 1, lockedUntil: 0, firstAttempt: now });
  } else {
    record.attempts++;
    if (record.attempts >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_MS;
    }
  }

  // Garbage collect expired entries to prevent memory exhaustion
  if (rateLimitMap.size > 500) {
    for (const [key, val] of rateLimitMap.entries()) {
      if (val.lockedUntil < now && now - val.firstAttempt > WINDOW_MS) {
        rateLimitMap.delete(key);
      }
    }
  }
}

export function clearRateLimit(ip: string): void {
  rateLimitMap.delete(ip);
}

// ─── Directory Jailing & Path Traversal Mitigations (CWE-22) ───────────
export function getSafeLogPath(fileName: string): string | null {
  if (!fileName || typeof fileName !== 'string') return null;
  const base = path.basename(fileName);
  if (base !== fileName) return null; // Contains slashes or path manipulation
  if (!base.endsWith('.log') && !base.endsWith('.log.gz')) return null;

  const resolved = path.resolve(LOG_DIR, base);
  if (!resolved.startsWith(path.resolve(LOG_DIR))) return null;

  return resolved;
}

// ─── Date Range Evaluation Helper ──────────────────────────────────────
export function computeDateBoundaries(options: DateFilterOptions): { startTime: number; endTime: number } {
  const now = Date.now();
  const { preset, startDate, endDate } = options;

  if (startDate || endDate) {
    const s = startDate ? new Date(startDate).getTime() : 0;
    const e = endDate ? new Date(endDate).getTime() : Infinity;
    return { startTime: isNaN(s) ? 0 : s, endTime: isNaN(e) ? Infinity : e };
  }

  const nowDate = new Date();

  switch (preset) {
    case 'TODAY': {
      const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), 0, 0, 0).getTime();
      return { startTime: todayStart, endTime: now };
    }
    case 'YESTERDAY': {
      const yestStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 1, 0, 0, 0).getTime();
      const yestEnd = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 1, 23, 59, 59, 999).getTime();
      return { startTime: yestStart, endTime: yestEnd };
    }
    case '1H':
      return { startTime: now - 60 * 60 * 1000, endTime: now };
    case '6H':
      return { startTime: now - 6 * 60 * 60 * 1000, endTime: now };
    case '24H':
      return { startTime: now - 24 * 60 * 60 * 1000, endTime: now };
    case '7D':
      return { startTime: now - 7 * 24 * 60 * 60 * 1000, endTime: now };
    case '1M':
      return { startTime: now - 30 * 24 * 60 * 60 * 1000, endTime: now };
    case 'ALL':
    default:
      return { startTime: 0, endTime: Infinity };
  }
}

// ─── Asynchronous Non-Blocking Line Streaming Engine ───────────────────
export async function streamLogFileLines(
  filePath: string,
  type: 'out' | 'err',
  boundaries: { startTime: number; endTime: number },
  maxLines: number = 1000
): Promise<LogEntry[]> {
  if (!fs.existsSync(filePath)) return [];

  const isGz = filePath.endsWith('.gz');
  let inputStream: NodeJS.ReadableStream;

  if (isGz) {
    const gunzip = zlib.createGunzip();
    let decompressedBytes = 0;
    const MAX_DECOMPRESSED = 5 * 1024 * 1024; // 5 MB Decompression bomb safeguard (CWE-400)

    gunzip.on('data', (chunk) => {
      decompressedBytes += chunk.length;
      if (decompressedBytes > MAX_DECOMPRESSED) {
        gunzip.destroy(new Error('Decompression limit exceeded (5 MB safety cap)'));
      }
    });

    inputStream = fs.createReadStream(filePath).pipe(gunzip);
  } else {
    inputStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  }

  const rl = readline.createInterface({
    input: inputStream,
    crlfDelay: Infinity,
  });

  const lines: LogEntry[] = [];
  let idCounter = 1;
  let lastTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  for await (const rawLine of rl) {
    if (!rawLine || !rawLine.trim()) continue;

    // Extract timestamp
    const tsMatch = rawLine.match(/^\[?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})/);
    let lineTime = lastTimestamp;
    let epochTime = 0;

    if (tsMatch && tsMatch[1]) {
      lineTime = tsMatch[1].replace('T', ' ');
      lastTimestamp = lineTime;
      epochTime = new Date(lineTime.replace(' ', 'T')).getTime();
    } else {
      epochTime = new Date(lastTimestamp.replace(' ', 'T')).getTime();
    }

    // Filter by date range on the fly without accumulating memory
    if (epochTime > 0) {
      if (epochTime < boundaries.startTime || epochTime > boundaries.endTime) {
        continue;
      }
    }

    // Determine log level
    let level: 'INFO' | 'WARN' | 'ERROR' = type === 'err' ? 'ERROR' : 'INFO';
    const upper = rawLine.toUpperCase();
    if (upper.includes('[ERROR]') || upper.includes('ERROR:') || upper.includes('ERR:')) {
      level = 'ERROR';
    } else if (upper.includes('[WARN]') || upper.includes('WARN:') || upper.includes('WARNING:')) {
      level = 'WARN';
    }

    // Determine subsystem / module
    let service = type === 'err' ? '[System-Error]' : '[Server]';
    const serviceMatch = rawLine.match(/\[(WebSocket|AiService|Auth|R2Service|Payment|Security|Health|Server|Queue)\]/i);
    if (serviceMatch) {
      service = `[${serviceMatch[1]}]`;
    }

    // Scrub secrets
    const sanitized = redactSecrets(rawLine);

    lines.push({
      id: idCounter++,
      time: lineTime,
      level,
      type,
      service,
      content: sanitized,
    });

    // Keep bounded memory window
    if (lines.length > maxLines * 2) {
      lines.splice(0, lines.length - maxLines);
    }
  }

  return lines.slice(-maxLines);
}

// ─── Router Implementation ──────────────────────────────────────────────
export function createSecureLogVaultRouter(basePath: string = '/ops-log-vault-9x2k'): Router {
  const router = Router();

  // Authentication Middleware
  const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    const token = req.cookies[COOKIE_NAME];
    const auth = verifySessionToken(token);
    if (!auth.valid) {
      if (req.path.startsWith('/api/')) {
        res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
        return;
      }
      res.redirect(`${basePath}/login`);
      return;
    }
    next();
  };

  // 0. GET /icon.png — Serve Brand Favicon / Logo
  router.get('/icon.png', (_req: Request, res: Response) => {
    const candidates = [
      path.resolve(process.cwd(), '../frontend/public/Sree-Ai-Fav-icon.png'),
      path.resolve(process.cwd(), 'frontend/public/Sree-Ai-Fav-icon.png'),
      path.resolve(__dirname, '../../../frontend/public/Sree-Ai-Fav-icon.png'),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        fs.createReadStream(file).pipe(res);
        return;
      }
    }
    res.redirect('https://app.sreeai.qzz.io/Sree-Ai-Fav-icon.png');
  });

  // 1. GET /login — Render Login Page
  router.get('/login', (req: Request, res: Response) => {
    const token = req.cookies[COOKIE_NAME];
    if (verifySessionToken(token).valid) {
      res.redirect(basePath);
      return;
    }
    const ip = getClientIp(req);
    const limit = checkRateLimit(ip);
    const config = getVaultConfig();

    let error = limit.limited ? 'Too many failed attempts. Access temporarily locked.' : undefined;
    if (!config.isConfigured && !error) {
      error = 'Ops Vault is not configured. LOG_VAULT_USER, LOG_VAULT_PASS, and LOG_VAULT_SESSION_SECRET must be configured.';
    }

    const csrfToken = crypto.randomBytes(24).toString('hex');
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
      path: basePath
    });

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Security-Policy', CSP_HEADER);
    res.send(renderLoginHtml({
      basePath,
      error,
      retryAfter: limit.retryAfterSec,
      csrfToken
    }));
  });

  // 2. POST /login — Authenticate Operator
  router.post('/login', (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const limit = checkRateLimit(ip);
    const config = getVaultConfig();

    if (limit.limited) {
      res.status(429).send(renderLoginHtml({
        basePath,
        error: 'Too many failed login attempts.',
        retryAfter: limit.retryAfterSec
      }));
      return;
    }

    if (!config.isConfigured || !config.user || !config.pass) {
      res.status(503).send(renderLoginHtml({
        basePath,
        error: 'Ops Vault credentials are not configured on this server.'
      }));
      return;
    }

    // Validate anti-CSRF token if cookie is present
    const expectedCsrf = req.cookies[CSRF_COOKIE_NAME];
    const suppliedCsrf = req.body?._csrf;
    if (expectedCsrf) {
      if (!suppliedCsrf || !timingSafeEqual(String(suppliedCsrf), String(expectedCsrf))) {
        res.status(403).send(renderLoginHtml({
          basePath,
          error: 'Invalid or expired CSRF token. Please refresh and try again.'
        }));
        return;
      }
    }

    const { username, password } = req.body || {};

    if (!username || !password) {
      recordFailedAttempt(ip);
      const newLimit = checkRateLimit(ip);
      res.status(401).send(renderLoginHtml({
        basePath,
        error: 'Invalid operator credentials.',
        retryAfter: newLimit.retryAfterSec
      }));
      return;
    }

    const validUser = timingSafeEqual(username, config.user);
    const validPass = timingSafeEqual(password, config.pass);

    if (!validUser || !validPass) {
      recordFailedAttempt(ip);
      const newLimit = checkRateLimit(ip);
      res.status(401).send(renderLoginHtml({
        basePath,
        error: 'Invalid operator credentials.',
        retryAfter: newLimit.retryAfterSec
      }));
      return;
    }

    // Success — Clear rate limit & issue signed cookie restricted to basePath
    clearRateLimit(ip);
    const sessionToken = createSessionToken(username);

    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: basePath
    });
    if (expectedCsrf) {
      res.clearCookie(CSRF_COOKIE_NAME, { path: basePath });
    }

    res.redirect(basePath);
  });

  // 3. GET /logout — Clear Session
  router.get('/logout', (_req: Request, res: Response) => {
    res.clearCookie(COOKIE_NAME, { path: basePath });
    res.clearCookie(CSRF_COOKIE_NAME, { path: basePath });
    res.redirect(`${basePath}/login`);
  });

  // 4. GET / — Main Ops Vault SPA Dashboard
  router.get('/', requireAuth, (_req: Request, res: Response) => {
    const telemetry = telemetryService.getTelemetry();
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Security-Policy', CSP_HEADER);
    res.send(renderDashboardHtml({
      basePath,
      nodeVersion: process.version,
      initialTelemetry: telemetry
    }));
  });

  // 5. GET /api/metrics — Real-Time Telemetry Feed
  router.get('/api/metrics', requireAuth, (_req: Request, res: Response) => {
    const telemetry = telemetryService.getTelemetry();
    res.json(telemetry);
  });

  // 6. GET /api/logs — Asynchronous Log Records with Date Filtering
  router.get('/api/logs', requireAuth, async (req: Request, res: Response) => {
    try {
      const fileQuery = (req.query.file as string) || 'combined';
      const preset = req.query.preset as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const limit = Math.min(2000, Math.max(10, parseInt(req.query.limit as string) || 500));

      const boundaries = computeDateBoundaries({ preset, startDate, endDate });

      let lines: LogEntry[] = [];
      const outPath = path.join(LOG_DIR, 'out.log');
      const errPath = path.join(LOG_DIR, 'err.log');

      if (fileQuery === 'combined') {
        const [outLines, errLines] = await Promise.all([
          streamLogFileLines(outPath, 'out', boundaries, limit),
          streamLogFileLines(errPath, 'err', boundaries, limit),
        ]);
        lines = [...outLines, ...errLines].sort((a, b) => {
          return new Date(a.time.replace(' ', 'T')).getTime() - new Date(b.time.replace(' ', 'T')).getTime();
        });
      } else {
        const safePath = getSafeLogPath(fileQuery);
        if (!safePath) {
          res.status(400).json({ error: 'Invalid or forbidden log file requested' });
          return;
        }
        const type = safePath.includes('err') ? 'err' : 'out';
        lines = await streamLogFileLines(safePath, type, boundaries, limit);
      }

      // Check available files in directory
      let availableFiles: string[] = ['out.log', 'err.log'];
      try {
        if (fs.existsSync(LOG_DIR)) {
          const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log') || f.endsWith('.log.gz'));
          availableFiles = Array.from(new Set([...availableFiles, ...files]));
        }
      } catch {
        // use default
      }

      res.json({
        files: availableFiles,
        lines: lines.slice(-limit),
        totalCount: lines.length,
      });
    } catch (err: any) {
      console.error('[OpsVault] Error reading log streams:', err);
      res.status(500).json({ error: 'Error reading log streams' });
    }
  });

  // 7. GET /api/tail — Live Tail Poller
  router.get('/api/tail', requireAuth, async (req: Request, res: Response) => {
    try {
      const fileQuery = (req.query.file as string) || 'combined';
      const after = req.query.after as string;
      const afterEpoch = after ? new Date(after.replace(' ', 'T')).getTime() : Date.now() - 5000;

      const boundaries = { startTime: afterEpoch + 1, endTime: Infinity };
      let newLines: LogEntry[] = [];

      if (fileQuery === 'combined') {
        const outPath = path.join(LOG_DIR, 'out.log');
        const errPath = path.join(LOG_DIR, 'err.log');
        const [outLines, errLines] = await Promise.all([
          streamLogFileLines(outPath, 'out', boundaries, 50),
          streamLogFileLines(errPath, 'err', boundaries, 50),
        ]);
        newLines = [...outLines, ...errLines].sort((a, b) => {
          return new Date(a.time.replace(' ', 'T')).getTime() - new Date(b.time.replace(' ', 'T')).getTime();
        });
      } else {
        const safePath = getSafeLogPath(fileQuery);
        if (!safePath) {
          res.status(400).json({ error: 'Invalid log file' });
          return;
        }
        newLines = await streamLogFileLines(safePath, safePath.includes('err') ? 'err' : 'out', boundaries, 50);
      }

      res.json({ newLines });
    } catch (err: any) {
      console.error('[OpsVault] Error polling tail logs:', err);
      res.status(500).json({ error: 'Error polling tail logs' });
    }
  });

  return router;
}

export default createSecureLogVaultRouter;
