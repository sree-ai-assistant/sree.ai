/**
 * Browser Fingerprint Generator
 * 
 * Generates a SHA-256 hash from stable browser characteristics:
 * - Browser name/version, OS, screen dimensions, timezone, language
 * - Canvas rendering fingerprint
 * - WebGL renderer/vendor fingerprint
 * 
 * This creates a high-confidence fingerprint for identity restoration
 * when cookies are cleared (ANON-03).
 * 
 * Privacy note: The fingerprint components are hashed client-side.
 * Only the hash is sent to the server — never raw component data.
 */

// ─── Component Collectors ────────────────────────────────────────

function getScreenInfo(): string {
  return [
    screen.width,
    screen.height,
    screen.colorDepth,
    window.devicePixelRatio || 1,
  ].join('|');
}

function getTimezoneInfo(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return new Date().getTimezoneOffset().toString();
  }
}

function getLanguageInfo(): string {
  return [
    navigator.language,
    ...(navigator.languages || []),
  ].join(',');
}

function getBrowserInfo(): string {
  return [
    navigator.userAgent,
    navigator.platform || '',
    navigator.hardwareConcurrency || 0,
    navigator.maxTouchPoints || 0,
  ].join('|');
}

/**
 * Canvas fingerprint — renders text and shapes, extracts the pixel data as a string.
 * Different GPUs/browsers produce slightly different renderings.
 */
function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'canvas-unsupported';

    // Draw text with specific styling
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('SreeAI fp', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('SreeAI fp', 4, 17);

    // Draw geometric shape
    ctx.beginPath();
    ctx.arc(50, 30, 10, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toDataURL();
  } catch {
    return 'canvas-error';
  }
}

/**
 * WebGL fingerprint — extracts GPU renderer and vendor info.
 */
function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl || !(gl instanceof WebGLRenderingContext)) return 'webgl-unsupported';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'webgl-no-debug';

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';

    return `${vendor}|${renderer}`;
  } catch {
    return 'webgl-error';
  }
}

// ─── Hash Function ───────────────────────────────────────────────

/**
 * SHA-256 hash using the Web Crypto API (available in all modern browsers).
 */
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Generate a fingerprint hash from all browser characteristics.
 * Returns a hex SHA-256 string.
 */
export async function generateFingerprintHash(): Promise<string> {
  const components = [
    getScreenInfo(),
    getTimezoneInfo(),
    getLanguageInfo(),
    getBrowserInfo(),
    getCanvasFingerprint(),
    getWebGLFingerprint(),
  ];

  const rawFingerprint = components.join(':::');
  return sha256(rawFingerprint);
}

// ─── Anonymous ID Storage (ANON-02) ─────────────────────────────

const ANON_ID_KEY = 'sreeai_anon_id';
const ANON_ID_COOKIE = 'sreeai_anon_id';

/**
 * Get the stored anonymous ID from cookie or localStorage.
 * Cookie is primary (httpOnly set by backend), localStorage is backup.
 */
export function getStoredAnonId(): string | null {
  // Try cookie first
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )${ANON_ID_COOKIE}=([^;]*)`));
  if (cookieMatch?.[1]) return decodeURIComponent(cookieMatch[1]);

  // Fallback to localStorage
  try {
    return localStorage.getItem(ANON_ID_KEY);
  } catch {
    return null;
  }
}

/**
 * Store the anonymous ID in localStorage as a backup.
 * The httpOnly cookie is set by the backend response.
 */
export function storeAnonId(anonId: string): void {
  try {
    localStorage.setItem(ANON_ID_KEY, anonId);
  } catch {
    // localStorage might be blocked in incognito — silently fail
  }
}

/**
 * Generate a new anonymous UUID (v4) client-side.
 */
export function generateAnonId(): string {
  return crypto.randomUUID();
}

/**
 * Get or create an anonymous identity.
 * 
 * 1. Check cookie/localStorage for existing ID
 * 2. If none, generate a new one and store locally
 * 3. Return the ID and fingerprint hash for the backend
 */
export async function getOrCreateAnonymousIdentity(): Promise<{
  anonId: string;
  fingerprintHash: string;
  isNew: boolean;
}> {
  const existingId = getStoredAnonId();
  const fingerprintHash = await generateFingerprintHash();

  if (existingId) {
    return { anonId: existingId, fingerprintHash, isNew: false };
  }

  const newId = generateAnonId();
  storeAnonId(newId);
  return { anonId: newId, fingerprintHash, isNew: true };
}
