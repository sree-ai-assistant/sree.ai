/**
 * Datacenter / VPN CIDR Ranges
 * 
 * Used to FLAG (not block) requests from known datacenter/VPN IP ranges.
 * Flagged requests get elevated scrutiny in the abuse detection pipeline
 * but are not automatically rejected.
 * 
 * Format: Array of { cidr, provider, type } objects.
 * - cidr: CIDR notation (e.g. "103.21.244.0/22")
 * - provider: Human-readable provider name
 * - type: 'datacenter' | 'vpn' | 'proxy'
 * 
 * References: ABUSE-05 (VPN/datacenter detection)
 * Phase 11
 */

export interface CidrEntry {
  cidr: string;
  provider: string;
  type: 'datacenter' | 'vpn' | 'proxy';
}

/**
 * Known datacenter/cloud provider CIDR ranges.
 * This is a curated subset — not exhaustive.
 * Update periodically from public ASN databases.
 */
export const DATACENTER_CIDRS: CidrEntry[] = [
  // ── AWS ──────────────────────────────────────────────
  { cidr: '3.0.0.0/8',       provider: 'AWS',              type: 'datacenter' },
  { cidr: '13.32.0.0/15',    provider: 'AWS CloudFront',   type: 'datacenter' },
  { cidr: '13.224.0.0/14',   provider: 'AWS CloudFront',   type: 'datacenter' },
  { cidr: '18.0.0.0/8',      provider: 'AWS',              type: 'datacenter' },
  { cidr: '34.192.0.0/10',   provider: 'AWS',              type: 'datacenter' },
  { cidr: '35.152.0.0/13',   provider: 'AWS',              type: 'datacenter' },
  { cidr: '52.0.0.0/11',     provider: 'AWS',              type: 'datacenter' },
  { cidr: '54.0.0.0/8',      provider: 'AWS',              type: 'datacenter' },

  // ── Google Cloud ─────────────────────────────────────
  { cidr: '34.64.0.0/10',    provider: 'Google Cloud',     type: 'datacenter' },
  { cidr: '35.184.0.0/13',   provider: 'Google Cloud',     type: 'datacenter' },
  { cidr: '35.192.0.0/14',   provider: 'Google Cloud',     type: 'datacenter' },
  { cidr: '35.196.0.0/15',   provider: 'Google Cloud',     type: 'datacenter' },
  { cidr: '35.198.0.0/16',   provider: 'Google Cloud',     type: 'datacenter' },
  { cidr: '35.199.0.0/16',   provider: 'Google Cloud',     type: 'datacenter' },
  { cidr: '35.200.0.0/13',   provider: 'Google Cloud',     type: 'datacenter' },

  // ── Azure ────────────────────────────────────────────
  { cidr: '13.64.0.0/11',    provider: 'Azure',            type: 'datacenter' },
  { cidr: '13.96.0.0/13',    provider: 'Azure',            type: 'datacenter' },
  { cidr: '13.104.0.0/14',   provider: 'Azure',            type: 'datacenter' },
  { cidr: '20.0.0.0/8',      provider: 'Azure',            type: 'datacenter' },
  { cidr: '40.64.0.0/10',    provider: 'Azure',            type: 'datacenter' },
  { cidr: '52.224.0.0/11',   provider: 'Azure',            type: 'datacenter' },

  // ── DigitalOcean ─────────────────────────────────────
  { cidr: '104.131.0.0/16',  provider: 'DigitalOcean',     type: 'datacenter' },
  { cidr: '134.209.0.0/16',  provider: 'DigitalOcean',     type: 'datacenter' },
  { cidr: '137.184.0.0/16',  provider: 'DigitalOcean',     type: 'datacenter' },
  { cidr: '138.68.0.0/16',   provider: 'DigitalOcean',     type: 'datacenter' },
  { cidr: '142.93.0.0/16',   provider: 'DigitalOcean',     type: 'datacenter' },
  { cidr: '159.65.0.0/16',   provider: 'DigitalOcean',     type: 'datacenter' },
  { cidr: '159.89.0.0/16',   provider: 'DigitalOcean',     type: 'datacenter' },
  { cidr: '161.35.0.0/16',   provider: 'DigitalOcean',     type: 'datacenter' },
  { cidr: '167.71.0.0/16',   provider: 'DigitalOcean',     type: 'datacenter' },
  { cidr: '167.172.0.0/16',  provider: 'DigitalOcean',     type: 'datacenter' },
  { cidr: '178.128.0.0/16',  provider: 'DigitalOcean',     type: 'datacenter' },
  { cidr: '206.189.0.0/16',  provider: 'DigitalOcean',     type: 'datacenter' },

  // ── Vultr ────────────────────────────────────────────
  { cidr: '45.32.0.0/16',    provider: 'Vultr',            type: 'datacenter' },
  { cidr: '45.63.0.0/16',    provider: 'Vultr',            type: 'datacenter' },
  { cidr: '45.76.0.0/16',    provider: 'Vultr',            type: 'datacenter' },
  { cidr: '45.77.0.0/16',    provider: 'Vultr',            type: 'datacenter' },
  { cidr: '66.42.0.0/16',    provider: 'Vultr',            type: 'datacenter' },
  { cidr: '108.61.0.0/16',   provider: 'Vultr',            type: 'datacenter' },
  { cidr: '149.28.0.0/16',   provider: 'Vultr',            type: 'datacenter' },

  // ── Hetzner ──────────────────────────────────────────
  { cidr: '95.216.0.0/16',   provider: 'Hetzner',          type: 'datacenter' },
  { cidr: '135.181.0.0/16',  provider: 'Hetzner',          type: 'datacenter' },
  { cidr: '65.108.0.0/16',   provider: 'Hetzner',          type: 'datacenter' },
  { cidr: '65.109.0.0/16',   provider: 'Hetzner',          type: 'datacenter' },

  // ── Linode / Akamai ──────────────────────────────────
  { cidr: '45.33.0.0/16',    provider: 'Linode',           type: 'datacenter' },
  { cidr: '45.56.0.0/16',    provider: 'Linode',           type: 'datacenter' },
  { cidr: '50.116.0.0/16',   provider: 'Linode',           type: 'datacenter' },
  { cidr: '66.175.208.0/20', provider: 'Linode',           type: 'datacenter' },
  { cidr: '69.164.192.0/19', provider: 'Linode',           type: 'datacenter' },
  { cidr: '96.126.96.0/19',  provider: 'Linode',           type: 'datacenter' },
  { cidr: '172.104.0.0/15',  provider: 'Linode',           type: 'datacenter' },
  { cidr: '173.255.192.0/18',provider: 'Linode',           type: 'datacenter' },
  { cidr: '192.155.80.0/20', provider: 'Linode',           type: 'datacenter' },
  { cidr: '198.58.96.0/19',  provider: 'Linode',           type: 'datacenter' },

  // ── OVH ──────────────────────────────────────────────
  { cidr: '51.68.0.0/16',    provider: 'OVH',              type: 'datacenter' },
  { cidr: '51.75.0.0/16',    provider: 'OVH',              type: 'datacenter' },
  { cidr: '51.77.0.0/16',    provider: 'OVH',              type: 'datacenter' },
  { cidr: '51.79.0.0/16',    provider: 'OVH',              type: 'datacenter' },
  { cidr: '51.81.0.0/16',    provider: 'OVH',              type: 'datacenter' },
  { cidr: '51.83.0.0/16',    provider: 'OVH',              type: 'datacenter' },
  { cidr: '51.89.0.0/16',    provider: 'OVH',              type: 'datacenter' },
  { cidr: '51.91.0.0/16',    provider: 'OVH',              type: 'datacenter' },

  // ── Common VPN providers ─────────────────────────────
  // NordVPN, ExpressVPN, Surfshark etc. use datacenter IPs
  // that overlap with the ranges above. We add specific known
  // VPN exit node ranges here as they become available.
  // For now, datacenter detection serves as a proxy.
];

/**
 * Parse a CIDR string into its base IP (as 32-bit integer) and subnet mask.
 */
function parseCidr(cidr: string): { base: number; mask: number } {
  const [ip, prefixStr] = cidr.split('/');
  if (!ip || !prefixStr) throw new Error(`Invalid CIDR: ${cidr}`);
  
  const prefix = parseInt(prefixStr, 10);
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) throw new Error(`Invalid IP in CIDR: ${cidr}`);

  const base = ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;

  return { base, mask };
}

/**
 * Convert an IPv4 address string to a 32-bit integer.
 */
function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return 0;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

// Pre-parse all CIDRs at module load for fast lookup
const PARSED_CIDRS = DATACENTER_CIDRS.map(entry => ({
  ...entry,
  ...parseCidr(entry.cidr),
}));

/**
 * Check if an IP address belongs to a known datacenter/VPN range.
 * Returns the matching entry or null.
 * 
 * @param ip - Raw IPv4 address string (e.g. "34.192.1.1")
 */
export function matchDatacenterIp(ip: string): CidrEntry | null {
  // Skip IPv6 and localhost
  if (ip.includes(':') || ip === '127.0.0.1' || ip === '0.0.0.0') {
    return null;
  }

  const ipInt = ipToInt(ip);
  if (ipInt === 0) return null;

  for (const entry of PARSED_CIDRS) {
    if ((ipInt & entry.mask) === (entry.base & entry.mask)) {
      return { cidr: entry.cidr, provider: entry.provider, type: entry.type };
    }
  }

  return null;
}
