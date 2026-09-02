import React from 'react';
import { LegalLayout } from './LegalLayout';

export const SecurityPage: React.FC = () => {
  return (
    <LegalLayout
      title="Security & BYOK Policy"
      subtitle="Cryptographic key vaulting, Row Level Security, Shared Responsibility Matrix, and vulnerability disclosure standards."
      badge="Security Architecture"
      lastUpdated="August 20, 2026"
    >
      <h2>1. Security Architecture & Zero-Trust Philosophy</h2>
      <p>
        At <strong>Sree AI</strong>, security and privacy are engineered directly into our multi-modal AI platform. We follow strict <strong>Defense-in-Depth</strong> and <strong>Zero-Trust</strong> security principles to protect conversational completions, media files, and sensitive third-party API credentials.
      </p>

      <hr />

      <h2>2. Cryptographic Controls & Data Protection</h2>
      <h3>2.1 Encryption in Transit</h3>
      <p>
        All communication between client browsers, backend application servers, databases, and third-party AI providers is encrypted in transit using <strong>TLS 1.3</strong> and <strong>TLS 1.2</strong>. HTTP Strict Transport Security (<strong>HSTS</strong>) headers are enforced across all endpoints.
      </p>

      <h3>2.2 Encryption at Rest & BYOK Key Vaulting</h3>
      <ul>
        <li><strong>Algorithm:</strong> User-supplied API keys (NVIDIA NIM, Google Gemini, Groq, Deepgram) are encrypted using <strong>AES-256-GCM</strong> (Advanced Encryption Standard in Galois/Counter Mode).</li>
        <li><strong>Initialization Vectors (IV):</strong> Every encrypted key is stored alongside a unique, cryptographically random 16-byte initialization vector (<code>iv</code>).</li>
        <li><strong>Key Isolation:</strong> Decryption occurs transiently in volatile backend server memory strictly during the execution lifecycle of the specific inference request. Raw keys are never written to disk or logs in plaintext.</li>
      </ul>

      <h3>2.3 Identity Privacy & Salted Hashing</h3>
      <p>
        Client IP addresses are passed through a salted <strong>SHA-256</strong> one-way cryptographic hash before being referenced in rate limiting or abuse logs. Browser fingerprints are securely hashed to detect automated botnets without storing personal hardware serials.
      </p>

      <hr />

      <h2>3. Database Security & Row Level Security (RLS)</h2>
      <p>Our database utilizes Supabase PostgreSQL with mandatory <strong>Row Level Security (RLS)</strong> enforced across 100% of exposed tables:</p>
      <table>
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
            <td>Restricted strictly to <code>service_role</code> (Hidden from client APIs)</td>
          </tr>
          <tr>
            <td><code>cleanup_logs</code></td>
            <td>Restricted strictly to <code>service_role</code> (Internal automated audit log)</td>
          </tr>
        </tbody>
      </table>

      <hr />

      <h2>4. Shared Responsibility Model & Third-Party Risk Allocation</h2>
      <p>Security in Sree AI operates under a <strong>Shared Responsibility Framework</strong>:</p>
      <table>
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
            <td>Physical data centers, PostgreSQL engine patching, RLS kernel enforcement, storage encryption (SOC 2 Type II).</td>
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
            <td>Sree AI enforces AES-256-GCM encryption at rest. User is responsible for setting provider spending caps.</td>
          </tr>
          <tr>
            <td><strong>Uploaded Document Confidentiality</strong></td>
            <td><strong>User (100% Sole Responsibility)</strong></td>
            <td>User is solely responsible for ensuring no unauthorized, illegal, or confidential trade secrets are uploaded.</td>
          </tr>
        </tbody>
      </table>

      <blockquote>
        <strong>Important Limitation:</strong> In no event shall Sree AI or its operators be held liable for security incidents, data breaches, zero-day exploits, or service interruptions that originate within the infrastructure or networks of third-party sub-processors (Supabase, Cloudflare, Razorpay, NVIDIA, Google, Groq, Deepgram) or through compromised client-side user devices.
      </blockquote>

      <hr />

      <h2>5. Vulnerability Disclosure & Responsible Reporting</h2>
      <p>We welcome security researchers and ethical hackers to responsibly test and disclose vulnerabilities:</p>
      <ul>
        <li><strong>Email:</strong> <a href="mailto:security@sreeai.qzz.io">security@sreeai.qzz.io</a></li>
        <li><strong>Subject Line:</strong> <code>[Vulnerability Disclosure] - Brief Title</code></li>
        <li><strong>Safe Harbor:</strong> Do not access or destroy user data; allow 30 days for remediation before disclosure. We acknowledge reports within 48 hours.</li>
      </ul>
    </LegalLayout>
  );
};
