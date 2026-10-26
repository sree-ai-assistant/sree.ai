/**
 * URL Validator & SSRF Protection Utility (CWE-918)
 *
 * Prevents Server-Side Request Forgery by ensuring that external URLs fetched
 * by the server (e.g., attachments, file downloads, media streams) strictly use HTTPS
 * and never target local, private, or cloud metadata network addresses.
 */

import { URL } from 'url';

// Blocked private / internal / link-local / loopback IP patterns (IPv4 & IPv6)
const BLOCKED_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,                            // IPv4 loopback (127.0.0.0/8)
  /^10\./,                             // IPv4 private Class A (10.0.0.0/8)
  /^172\.(1[6-9]|2\d|3[01])\./,        // IPv4 private Class B (172.16.0.0/12)
  /^192\.168\./,                       // IPv4 private Class C (192.168.0.0/16)
  /^169\.254\./,                       // IPv4 link-local & cloud metadata (169.254.0.0/16)
  /^0\./,                              // IPv4 current network (0.0.0.0/8)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // Carrier-grade NAT (100.64.0.0/10)
  /^198\.(1[89])\./,                   // Benchmark testing (198.18.0.0/15)
  /^\[::1\]$/,                         // IPv6 loopback
  /^\[fc/i,                            // IPv6 Unique Local Address (fc00::/7)
  /^\[fd/i,                            // IPv6 Unique Local Address (fd00::/8)
  /^\[fe80:/i,                         // IPv6 link-local (fe80::/10)
  /^\[::ffff:127\./i,                  // IPv4-mapped IPv6 loopback
  /^\[::ffff:10\./i,                   // IPv4-mapped IPv6 private
  /^\[::ffff:172\.(1[6-9]|2\d|3[01])\./i,
  /^\[::ffff:192\.168\./i,
  /^\[::ffff:169\.254\./i,
];

// Blocked internal or metadata hostnames
const BLOCKED_HOSTNAMES = [
  'metadata.google.internal',
  'metadata.google',
  'instance-data',
  'vault',
  'consul',
  'kubernetes.default',
  'kubernetes.default.svc',
];

export interface UrlValidationResult {
  safe: boolean;
  reason?: string;
  parsedUrl?: URL;
}

/**
 * Validates whether a given URL is safe for server-side fetching.
 *
 * Rules:
 * 1. Must be a valid URL string.
 * 2. Protocol must be https:
 * 3. Hostname must not match local/private/cloud-metadata IP ranges or blocked internal domains.
 * 4. Port, if explicitly specified, must be 443 (standard HTTPS).
 */
export function validateSafeUrl(rawUrl: string): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { safe: false, reason: 'URL must be a non-empty string' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { safe: false, reason: 'Malformed URL format' };
  }

  // 1. Strict protocol enforcement
  if (parsed.protocol !== 'https:') {
    return { safe: false, reason: `Protocol '${parsed.protocol}' is disallowed. Only HTTPS is permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Reject empty or local hostnames
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return { safe: false, reason: `Restricted hostname: ${hostname}` };
  }

  // 3. Block private / reserved IP addresses
  if (BLOCKED_IP_PATTERNS.some((p) => p.test(hostname))) {
    return { safe: false, reason: `Restricted IP address / host: ${hostname}` };
  }

  // 4. Block known internal service hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { safe: false, reason: `Restricted metadata/internal host: ${hostname}` };
  }

  // 5. Port check: Only standard HTTPS (443) or no explicit port allowed
  if (parsed.port && parsed.port !== '443') {
    return { safe: false, reason: `Restricted port: ${parsed.port}. Only standard HTTPS port 443 is permitted.` };
  }

  return { safe: true, parsedUrl: parsed };
}

/**
 * Asserts that a URL is safe. Throws an Error with explanation if unsafe.
 */
export function assertSafeUrl(rawUrl: string): URL {
  const result = validateSafeUrl(rawUrl);
  if (!result.safe || !result.parsedUrl) {
    throw new Error(`[SSRF Protection] ${result.reason || 'Unsafe URL target'}`);
  }
  return result.parsedUrl;
}
