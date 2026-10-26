import { describe, it, expect } from 'vitest';
import { validateSafeUrl, assertSafeUrl } from './urlValidator';

describe('URL Validator & SSRF Protection (CWE-918)', () => {
  describe('validateSafeUrl', () => {
    it('approves legitimate public HTTPS URLs', () => {
      const allowedUrls = [
        'https://pub-43593f37b89642548243a2b1f468120e.r2.dev/file.pdf',
        'https://r2.example.com/asset.png',
        'https://sreeai.qzz.io/logo.webp',
        'https://oaidalleapiprodscus.blob.core.windows.net/test.jpg',
        'https://replicate.delivery/image.png',
      ];

      for (const url of allowedUrls) {
        const res = validateSafeUrl(url);
        expect(res.safe).toBe(true);
        expect(res.parsedUrl).toBeDefined();
      }
    });

    it('rejects non-HTTPS protocols', () => {
      const dangerousProtocols = [
        'http://example.com/file.pdf',
        'file:///etc/passwd',
        'gopher://127.0.0.1:6379/_flushall',
        'ftp://ftp.example.com/file.txt',
        'data:text/plain;base64,SGVsbG8=',
        'javascript:alert(1)',
      ];

      for (const url of dangerousProtocols) {
        const res = validateSafeUrl(url);
        expect(res.safe).toBe(false);
        expect(res.reason).toContain('disallowed');
      }
    });

    it('rejects loopback and localhost targets', () => {
      const localhostUrls = [
        'https://localhost/api/metrics',
        'https://localhost:443/test',
        'https://127.0.0.1/admin',
        'https://127.0.0.2/test',
        'https://[::1]/test',
        'https://myhost.localhost/test',
        'https://sub.local/test',
        'https://service.internal/test',
      ];

      for (const url of localhostUrls) {
        const res = validateSafeUrl(url);
        expect(res.safe).toBe(false);
      }
    });

    it('rejects private IPv4 networks (RFC 1918)', () => {
      const privateIps = [
        'https://10.0.0.1/file.pdf',
        'https://10.255.255.255/test',
        'https://172.16.0.1/test',
        'https://172.31.255.255/test',
        'https://192.168.1.1/secret',
        'https://192.168.0.254/config',
      ];

      for (const url of privateIps) {
        const res = validateSafeUrl(url);
        expect(res.safe).toBe(false);
        expect(res.reason).toContain('Restricted IP');
      }
    });

    it('rejects AWS/GCP/Azure cloud metadata addresses', () => {
      const metadataUrls = [
        'https://169.254.169.254/latest/meta-data/',
        'https://metadata.google.internal/computeMetadata/v1/',
        'https://metadata.google/computeMetadata/v1/',
        'https://instance-data/latest/meta-data/',
      ];

      for (const url of metadataUrls) {
        const res = validateSafeUrl(url);
        expect(res.safe).toBe(false);
      }
    });

    it('rejects non-standard ports (CWE-918 port scanning prevention)', () => {
      const nonStandardPorts = [
        'https://example.com:22/ssh',
        'https://example.com:80/http',
        'https://example.com:5000/app',
        'https://example.com:5432/postgres',
        'https://example.com:6379/redis',
        'https://example.com:8080/proxy',
      ];

      for (const url of nonStandardPorts) {
        const res = validateSafeUrl(url);
        expect(res.safe).toBe(false);
        expect(res.reason).toContain('Restricted port');
      }
    });

    it('handles empty or malformed strings safely', () => {
      expect(validateSafeUrl('').safe).toBe(false);
      expect(validateSafeUrl('   ').safe).toBe(false);
      expect(validateSafeUrl('not-a-valid-url').safe).toBe(false);
    });
  });

  describe('assertSafeUrl', () => {
    it('throws Error for unsafe URLs', () => {
      expect(() => assertSafeUrl('http://169.254.169.254')).toThrow('[SSRF Protection]');
      expect(() => assertSafeUrl('https://127.0.0.1/test')).toThrow('[SSRF Protection]');
    });

    it('returns parsed URL for safe HTTPS URL', () => {
      const parsed = assertSafeUrl('https://cdn.example.com/image.png');
      expect(parsed.hostname).toBe('cdn.example.com');
      expect(parsed.protocol).toBe('https:');
    });
  });
});
