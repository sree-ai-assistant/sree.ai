import React from 'react';
import { LegalLayout } from './LegalLayout';
import { ShieldCheck, Lock, AlertTriangle, Key, Server, Cpu, Database, CheckCircle2 } from 'lucide-react';
import styles from './LegalLayout.module.css';

export const SecurityPage: React.FC = () => {
  return (
    <LegalLayout
      title="Security & BYOK Policy"
      subtitle="Technical architecture, cryptographic AES-256-GCM vaulting, Row Level Security, and Shared Responsibility Framework on Sree AI."
      badge="Security Architecture"
      lastUpdated="August 20, 2026"
    >
      <div className={styles.callout}>
        <Lock className={styles.calloutIcon} size={20} />
        <div className={styles.calloutContent}>
          <strong>Defense-in-Depth Engineering:</strong>
          Sree AI enforces AES-256-GCM cryptographic encryption for BYOK credentials, TLS 1.3 in transit, 100% database Row Level Security (RLS) tenant isolation, and salted SHA-256 IP address hashing.
        </div>
      </div>

      <h2>1. Security Overview & Architecture Philosophy</h2>
      <p>
        At <strong>Sree AI</strong>, security and privacy are built directly into our platform architecture. As a multi-modal AI platform processing text completions, voice streams, media files, and sensitive third-party API credentials, we follow strict <strong>Defense-in-Depth</strong> and <strong>Zero-Trust</strong> security principles.
      </p>
      <p>
        This Security & Bring Your Own Key (BYOK) Policy outlines the technical and operational controls governing data protection, cryptographic safeguards, key vaulting, and cloud infrastructure security across the Sree AI ecosystem.
      </p>

      <hr />

      <h2>2. Cryptographic Controls & Data Protection</h2>
      <h3>2.1 Encryption in Transit</h3>
      <ul>
        <li>All communication between client browsers, backend application servers, databases, and third-party AI providers is encrypted in transit using <strong>TLS 1.3</strong> and <strong>TLS 1.2</strong> with strong cryptographic cipher suites.</li>
        <li>HTTP Strict Transport Security (<strong>HSTS</strong>) headers are enforced across all domains to prevent protocol downgrade attacks.</li>
      </ul>

      <h3>2.2 Encryption at Rest & BYOK Key Vaulting</h3>
      <ul>
        <li><strong>Algorithm:</strong> User-supplied API keys (NVIDIA NIM, Google Gemini, Groq, Deepgram) are encrypted using <strong>AES-256-GCM</strong> (Advanced Encryption Standard in Galois/Counter Mode).</li>
        <li><strong>Initialization Vectors (IV):</strong> Every encrypted key is stored alongside a unique, cryptographically random 16-byte initialization vector (<code>iv</code>). No static or reusable IVs are ever utilized.</li>
        <li><strong>Key Isolation:</strong> Decryption occurs transiently strictly in volatile backend server memory during the execution lifecycle of the specific inference request. Raw API keys are never written to server disks, application logs, or database rows in plaintext.</li>
      </ul>

      <h3>2.3 Identity Privacy & Salted Hashing</h3>
      <ul>
        <li><strong>Zero Plaintext IP Storage:</strong> Client IP addresses are never stored in raw form. IP addresses are passed through a salted <strong>SHA-256</strong> one-way cryptographic hash before being referenced in rate limiting or abuse logs.</li>
        <li><strong>Client Fingerprint Privacy:</strong> Browser fingerprints are securely hashed using SHA-256 to detect automated botnets and abuse vectors without storing personal hardware serials or unhashed identifiers.</li>
      </ul>

      <hr />

      <h2>3. Database Security & Row Level Security (RLS)</h2>
      <p>Our persistent data layer is hosted on Supabase PostgreSQL with mandatory <strong>Row Level Security (RLS)</strong> active across 100% of exposed tables:</p>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Table</th>
              <th>RLS Isolation Strategy</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>profiles</code></td>
              <td>Restricted strictly to <code>auth.uid() = id</code> for user reads/updates</td>
            </tr>
            <tr>
              <td><code>api_keys</code></td>
              <td>Restricted to <code>auth.uid() = user_id</code> (AES-256-GCM encrypted)</td>
            </tr>
            <tr>
              <td><code>conversations</code></td>
              <td>Dual-isolation: <code>auth.uid() = user_id</code> OR <code>anon_id = header('x-anon-id')</code></td>
            </tr>
            <tr>
              <td><code>messages</code></td>
              <td>Cascade verified via parent conversation ownership <code>EXISTS</code> check</td>
            </tr>
            <tr>
              <td><code>subscriptions</code></td>
              <td>Read-only for <code>auth.uid() = user_id</code>; mutation restricted to <code>service_role</code></td>
            </tr>
            <tr>
              <td><code>payment_history</code></td>
              <td>Read-only for <code>auth.uid() = user_id</code>; mutation restricted to <code>service_role</code></td>
            </tr>
            <tr>
              <td><code>abuse_flags</code></td>
              <td>Restricted strictly to <code>service_role</code> (Hidden from all client APIs)</td>
            </tr>
            <tr>
              <td><code>cleanup_logs</code></td>
              <td>Restricted strictly to <code>service_role</code> (Internal automated audit log)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr />

      <h2>4. Bring Your Own Key (BYOK) Governance</h2>
      <p>The BYOK feature enables users to connect their personal third-party AI provider credentials to Sree AI:</p>

      <h3>4.1 Benefits & Quota Multiplier</h3>
      <p>Users operating under BYOK mode receive a <strong>0.2x quota multiplier</strong> against their plan usage, enabling up to 5x more requests through our unified interface while paying their provider directly for underlying token costs.</p>

      <h3>4.2 User Responsibilities</h3>
      <ol>
        <li><strong>Third-Party Charges:</strong> You remain solely responsible for all API usage fees, token consumption, overages, and billing disputes incurred directly on your third-party provider accounts (e.g., NVIDIA, Google Cloud, Groq, Deepgram).</li>
        <li><strong>Key Lifecycle Management:</strong> You are responsible for ensuring that API keys submitted to Sree AI have appropriate spending limits, permissions, and IP restrictions enabled in your provider consoles.</li>
        <li><strong>Key Revocation:</strong> You may rotate, modify, or permanently delete your stored BYOK keys at any time via the Settings page. Deleting a key instantly purges both the encrypted ciphertext and initialization vector from the database.</li>
      </ol>

      <hr />

      <h2>5. Shared Responsibility Model & Third-Party Risk Allocation</h2>
      <p>Security in Sree AI operates under a <strong>Shared Responsibility Framework</strong>:</p>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Domain</th>
              <th>Responsible Entity</th>
              <th>Scope of Security Responsibility</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Database & Identity Storage</strong></td>
              <td><strong>Supabase Inc.</strong></td>
              <td>Physical data centers, PostgreSQL engine patching, RLS kernel enforcement, storage hardware encryption (SOC 2 Type II).</td>
            </tr>
            <tr>
              <td><strong>Object Storage (Files/Media)</strong></td>
              <td><strong>Cloudflare Inc.</strong></td>
              <td>S3-compatible R2 bucket encryption, edge network DDOS mitigation, global edge caching.</td>
            </tr>
            <tr>
              <td><strong>Payment & Financial Processing</strong></td>
              <td><strong>Razorpay Software Pvt Ltd</strong></td>
              <td>Cardholder data security, payment tokenization, PCI-DSS Level 1 compliance, banking gateway encryption.</td>
            </tr>
            <tr>
              <td><strong>AI Model Inference Execution</strong></td>
              <td><strong>NVIDIA / Google / Groq / Deepgram</strong></td>
              <td>Model serving infrastructure, GPU cluster isolation, LLM prompt transit security.</td>
            </tr>
            <tr>
              <td><strong>BYOK Key Confidentiality & Vault</strong></td>
              <td><strong>Sree AI & User</strong></td>
              <td>Sree AI enforces AES-256-GCM encryption at rest. User is responsible for setting provider spending caps and restricting key permissions.</td>
            </tr>
            <tr>
              <td><strong>Uploaded Document Confidentiality</strong></td>
              <td><strong>User (100% Sole Responsibility)</strong></td>
              <td>User is solely responsible for ensuring no unauthorized, illegal, or highly confidential trade secrets are uploaded without authorization.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={`${styles.callout} ${styles.calloutWarning}`}>
        <AlertTriangle className={styles.calloutIcon} size={20} />
        <div className={styles.calloutContent}>
          <strong>Important Limitation of Liability:</strong>
          In no event shall Sree AI or its operators be held liable for security incidents, data breaches, zero-day exploits, or service interruptions that originate within the infrastructure or networks of third-party sub-processors (Supabase, Cloudflare, Razorpay, NVIDIA, Google, Groq, Deepgram) or through compromised client-side user devices.
        </div>
      </div>

      <hr />

      <h2>6. Payment Security & Webhook Idempotency</h2>
      <ul>
        <li><strong>PCI-DSS Compliance:</strong> All payment transactions, checkout sessions, and recurring subscription billing are handled by <strong>Razorpay Software Private Limited</strong>, a certified <strong>PCI-DSS Level 1</strong> Service Provider.</li>
        <li><strong>HMAC-SHA256 Webhook Verification:</strong> Inbound payment webhooks (<code>subscription.charged</code>, <code>payment.failed</code>, <code>subscription.cancelled</code>) are validated using cryptographic <strong>HMAC-SHA256</strong> signatures against <code>RAZORPAY_WEBHOOK_SECRET</code>. Unsigned or mismatched payloads are rejected immediately.</li>
        <li><strong>Idempotency Safeguards:</strong> Every payment ID (<code>razorpay_payment_id</code>) is enforced as a unique constraint in the <code>payment_history</code> database table, preventing duplicate subscription credits or double-billing in the event of webhook replay attacks.</li>
      </ul>

      <hr />

      <h2>7. Abuse Prevention & Rate-Limiting Engine</h2>
      <p>To protect system availability from automated botnets, credential stuffers, and distributed denial-of-service (DDoS) threats, Sree AI employs an automated protection pipeline:</p>
      <ol>
        <li><strong>Atomic Quota Engine:</strong> Quotas are enforced in a single transaction via PostgreSQL RPC (<code>increment_multi_usage</code>) with row-level locks (<code>FOR UPDATE</code>), preventing concurrent burst bypasses.</li>
        <li><strong>Datacenter & VPN Heuristics:</strong> Automated abuse detection middleware flags suspicious high-frequency requests originating from automated hosting proxies or disposable accounts.</li>
        <li><strong>Automated Storage Purging:</strong> S3-compatible Cloudflare R2 temporary media buckets are regularly audited and purged via background cleanup jobs (<code>cleanup_logs</code>) to prevent orphaned data accumulation.</li>
      </ol>

      <hr />

      <h2>8. Vulnerability Disclosure & Bug Bounty</h2>
      <p>We welcome security researchers and ethical hackers to responsibly test and disclose vulnerabilities:</p>

      <h3>8.1 Reporting Guidelines</h3>
      <p>If you discover a security vulnerability in Sree AI, please notify us immediately at:</p>
      <ul>
        <li><strong>Email:</strong> <a href="mailto:security@sreeai.qzz.io">security@sreeai.qzz.io</a></li>
        <li><strong>Subject:</strong> <code>[Vulnerability Disclosure] - Brief Vulnerability Title</code></li>
      </ul>

      <h3>8.2 Safe Harbor Rules</h3>
      <p>When conducting research in good faith:</p>
      <ul>
        <li>Do not access, modify, or destroy another user's personal data.</li>
        <li>Do not execute destructive Denial of Service (DoS) attacks or automated brute-force attempts against production infrastructure.</li>
        <li>Provide a reasonable timeframe (minimum 30 days) for our engineering team to remediate the vulnerability before public disclosure.</li>
        <li>We will acknowledge receipt of your report within <strong>48 hours</strong> and provide remediation updates.</li>
      </ul>
    </LegalLayout>
  );
};
