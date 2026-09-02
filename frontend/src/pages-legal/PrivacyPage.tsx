import React from 'react';
import { LegalLayout } from './LegalLayout';
import { ShieldCheck, AlertTriangle, Database, Lock, UserCheck, Trash2, Cpu } from 'lucide-react';
import styles from './LegalLayout.module.css';

export const PrivacyPage: React.FC = () => {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="How Sree AI collects, processes, encrypts, and safeguards your personal data in strict compliance with the Indian DPDP Act 2023, GDPR, and CCPA."
      badge="Privacy & Data Protection"
      lastUpdated="August 20, 2026"
    >
      <div className={styles.callout}>
        <ShieldCheck className={styles.calloutIcon} size={20} />
        <div className={styles.calloutContent}>
          <strong>Statutory Compliance & Privacy-First Architecture:</strong>
          Sree AI operates in full compliance with the <strong>Digital Personal Data Protection (DPDP) Act, 2023</strong> (India), <strong>Information Technology Act, 2000</strong> (Section 79 Safe Harbor), <strong>GDPR</strong> (EU/EEA), and <strong>CCPA/CPRA</strong> (California). We enforce zero raw IP logging, AES-256-GCM encryption for BYOK credentials, and 100% Row Level Security (RLS) tenant isolation.
        </div>
      </div>

      <h2>1. Introduction</h2>
      <p>
        Welcome to <strong>Sree AI</strong> ("Company", "we", "our", or "us"). We are committed to protecting your privacy and personal data. This Privacy Policy describes how we collect, use, process, disclose, and safeguard your personal information when you use our multi-modal AI software-as-a-service platform, web application, APIs, and associated services (collectively, the "Services").
      </p>
      <p>
        By accessing or using Sree AI, you acknowledge that you have read, understood, and agree to the collection and use of your information in accordance with this Privacy Policy and applicable data protection laws. If you do not agree with the terms of this Privacy Policy, please do not access or use the Services.
      </p>

      <hr />

      <h2>2. Information We Collect</h2>

      <h3>2.1 Information You Provide Directly to Us</h3>
      <ul>
        <li><strong>Account Registration Data:</strong> When creating an account via Supabase Auth (Email or OAuth providers such as Google/GitHub), we collect your email address, display name, nickname, avatar URL, occupation, and optional onboarding profile details.</li>
        <li><strong>User Customization & Instructions:</strong> Custom system prompts, tone preferences (<code>custom_instructions</code>), and personal background details (<code>more_about_you</code>) you choose to supply to customize AI interactions.</li>
        <li><strong>Chat Inputs & Media Content:</strong> Prompts, text messages, questions, uploaded files (PDFs, Word documents, Excel spreadsheets, images), voice audio recordings, and generated AI assets (images/videos).</li>
        <li><strong>Bring Your Own Key (BYOK) Credentials:</strong> If you opt into the BYOK feature, you provide external API keys (e.g., NVIDIA NIM, Google Gemini, Groq, Deepgram). These keys are encrypted immediately using <strong>AES-256-GCM</strong> before database insertion and are never stored in plaintext.</li>
        <li><strong>Support & Feature Requests:</strong> Information submitted through our ticket system, including your name, email, issue descriptions, and screenshots.</li>
      </ul>

      <h3>2.2 Information Collected Automatically</h3>
      <ul>
        <li><strong>Anonymous Session Identifiers (<code>anon_id</code>):</strong> For users who interact with Sree AI without creating an account, we generate a cryptographically random anonymous identifier stored in client cookies/localStorage.</li>
        <li><strong>Privacy-Preserving Fingerprints & Network Hashes:</strong>
          <ul>
            <li><strong>IP Address:</strong> We do <strong>not</strong> store raw, plaintext IP addresses. Raw IP addresses are processed through a salted <strong>SHA-256</strong> one-way cryptographic hash for abuse prevention and rate-limiting enforcement.</li>
            <li><strong>Browser Fingerprint:</strong> A SHA-256 hash of client screen resolution, browser capabilities, and operating system.</li>
          </ul>
        </li>
        <li><strong>Usage & Telemetry Data:</strong> Request timestamps, tool usage frequency (chat completions, image generations, audio transcriptions, token consumption), model selections, latency metrics, and error logs (via PostHog).</li>
        <li><strong>Device & Session Metadata:</strong> Operating system, browser type, device identifiers, and active session status recorded in <code>user_sessions</code> and <code>trusted_devices</code> to secure your account.</li>
      </ul>

      <h3>2.3 Payment & Billing Information</h3>
      <ul>
        <li>All financial transactions and recurring subscriptions are processed securely by our third-party payment processor, <strong>Razorpay</strong>.</li>
        <li><strong>We do NOT store or have access to raw credit/debit card numbers, CVVs, or net banking passwords.</strong></li>
        <li>We only retain payment transaction metadata: Razorpay Payment ID (<code>pay_xxx</code>), Subscription ID (<code>sub_xxx</code>), Order ID, currency (<code>INR</code>), plan tier, and transaction status for accounting and entitlement purposes.</li>
      </ul>

      <hr />

      <h2>3. Legal Bases for Processing (GDPR & DPDP Compliance)</h2>
      <p>We process your personal data under the following lawful bases:</p>
      <ol>
        <li><strong>Contractual Necessity (Art. 6(1)(b) GDPR):</strong> To deliver the AI services, manage subscriptions, process inference requests, and fulfill our Terms of Service.</li>
        <li><strong>Legitimate Interests (Art. 6(1)(f) GDPR):</strong> To detect abuse, prevent automated spam attacks, secure our infrastructure, monitor platform performance, and optimize AI key pooling.</li>
        <li><strong>Consent (Art. 6(1)(a) GDPR):</strong> For optional marketing communications, non-essential cookies, and file upload policy acknowledgments.</li>
        <li><strong>Legal Compliance (Art. 6(1)(c) GDPR):</strong> To comply with tax obligations, accounting laws, fraud prevention mandates, and valid legal requests.</li>
      </ol>

      <hr />

      <h2>4. How We Use Your Information</h2>
      <p>We utilize the collected information for the following specific purposes:</p>
      <ul>
        <li><strong>Service Delivery:</strong> Providing multi-turn conversational chat, voice transcription (STT), voice synthesis (TTS), and image/video generation.</li>
        <li><strong>Account & Subscription Management:</strong> Tracking plan quotas (Free, Starter, Pro), processing recurring renewals, handling upgrades/downgrades, and managing deferred cycle switches.</li>
        <li><strong>BYOK Discount Management:</strong> Verifying encrypted user keys and applying the 0.2x quota rate multiplier.</li>
        <li><strong>Abuse Prevention & Security:</strong> Enforcing rate limits via atomic PostgreSQL RPCs (<code>increment_multi_usage</code>), identifying unauthorized multi-account farming, and detecting malicious prompt injections.</li>
        <li><strong>Data Synchronization on Signup:</strong> Automatically migrating anonymous conversations, rate limit tallies, and preferences to an authenticated account upon user registration via <code>migrate_anonymous_data</code>.</li>
        <li><strong>System Improvements & Observability:</strong> Monitoring API error rates, tracking model response times, and auditing automated cleanup cron operations.</li>
      </ul>

      <hr />

      <h2>5. Third-Party Service Providers & Sub-Processors</h2>
      <p>We share necessary data with trusted sub-processors strictly for technical execution under Data Processing Agreements (DPAs):</p>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Sub-Processor</th>
              <th>Role / Function</th>
              <th>Data Shared</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Supabase Inc.</strong></td>
              <td>Cloud Database, Auth & Realtime Engine</td>
              <td>User profiles, chat history, encrypted API keys, session logs</td>
              <td>Global / US</td>
            </tr>
            <tr>
              <td><strong>Razorpay Software Private Limited</strong></td>
              <td>Payment Gateway & Subscription Billing</td>
              <td>Billing email, transaction amounts, subscription status</td>
              <td>India</td>
            </tr>
            <tr>
              <td><strong>Cloudflare Inc. (R2)</strong></td>
              <td>S3-Compatible Media & Document Storage</td>
              <td>Uploaded chat attachments, generated AI images/videos</td>
              <td>Global</td>
            </tr>
            <tr>
              <td><strong>NVIDIA Corporation (NIM)</strong></td>
              <td>AI Model Inference Provider</td>
              <td>User prompt text & context (Transient)</td>
              <td>US / Global</td>
            </tr>
            <tr>
              <td><strong>Google Cloud (Gemini / Veo)</strong></td>
              <td>AI Model & Video Inference Provider</td>
              <td>User prompt text, document content (Transient)</td>
              <td>US / Global</td>
            </tr>
            <tr>
              <td><strong>Groq Inc.</strong></td>
              <td>High-Speed Inference & Whisper STT</td>
              <td>Prompts & Audio data (Transient)</td>
              <td>US</td>
            </tr>
            <tr>
              <td><strong>Deepgram Inc.</strong></td>
              <td>Speech-To-Text (STT) Audio Processing</td>
              <td>Audio voice stream recordings (Transient)</td>
              <td>US</td>
            </tr>
            <tr>
              <td><strong>PostHog Inc.</strong></td>
              <td>Product Analytics & Error Diagnostics</td>
              <td>Sanitized interaction telemetry, performance metrics (Zero PII)</td>
              <td>US / EU</td>
            </tr>
            <tr>
              <td><strong>n8n Automation Engine</strong></td>
              <td>Notification & Webhook Automation</td>
              <td>Payment failure alerts, feature request tickets</td>
              <td>Self-Hosted / Germany</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={`${styles.callout} ${styles.calloutWarning}`}>
        <AlertTriangle className={styles.calloutIcon} size={20} />
        <div className={styles.calloutContent}>
          <strong>AI Model Processing & Provider Terms Notice:</strong>
          <br />1. Sree AI does NOT sell your personal data or user conversations.
          <br />2. When you upload files, documents (PDF, DOCX, XLSX), images, or audio prompts during chat, these inputs are transmitted directly to the selected AI provider (Google LLC, NVIDIA Corporation, Groq LLC, Deepgram Inc.) to execute inference.
          <br />3. Each AI model provider processes data in accordance with their respective enterprise API terms and privacy policies. While enterprise API endpoints generally do not train on customer inputs, some providers may retain transient logs for safety monitoring or process data under their standard terms. Sree AI disclaims all liability for upstream model provider data handling, retention, or processing practices.
        </div>
      </div>

      <hr />

      <h2>6. Data Retention & Automatic Cleanup</h2>
      <ul>
        <li><strong>Account Data:</strong> Profile information, subscription records, and BYOK credentials remain stored until you delete your account.</li>
        <li><strong>Chat & Conversation Logs:</strong> Retained in your account history until manually deleted by you via the user interface.</li>
        <li><strong>Media & File Attachments:</strong> Uploaded user attachments and generated images/videos stored in Cloudflare R2 are subject to automated storage cleanup policies according to your active subscription tier.</li>
        <li><strong>Anonymous Data:</strong> Anonymous user records (<code>anonymous_users</code>) inactive for over 90 days are automatically purged by scheduled database maintenance scripts (<code>cleanup_logs</code>).</li>
        <li><strong>Account Deletion:</strong> You can delete your account and all associated personal data anytime from the Settings page. Upon deletion, personal profile records, encrypted keys, active sessions, and conversation histories are permanently removed via cascading database deletions (<code>ON DELETE CASCADE</code>).</li>
      </ul>

      <hr />

      <h2>7. Security Architecture</h2>
      <p>We implement defense-in-depth technical and organizational measures to safeguard your information:</p>
      <ul>
        <li><strong>Encryption at Rest:</strong> User BYOK API keys are encrypted using <strong>AES-256-GCM</strong> with individualized cryptographic initialization vectors (<code>iv</code>).</li>
        <li><strong>Encryption in Transit:</strong> All traffic is encrypted using modern <strong>TLS 1.3 / HTTPS</strong> protocols.</li>
        <li><strong>Database Row Level Security (RLS):</strong> Supabase PostgreSQL RLS policies enforce strict tenant data isolation. Users can only read and mutate rows where <code>auth.uid() = id</code> or where the anonymous header matches <code>anon_id</code>.</li>
        <li><strong>Payment Verification:</strong> Webhooks are verified using cryptographic <strong>HMAC-SHA256</strong> signatures with anti-replay idempotency safeguards.</li>
        <li><strong>Zero Raw PII IP Tracking:</strong> Client IP addresses are never saved in cleartext.</li>
      </ul>

      <hr />

      <h2>8. Your Data Protection Rights & Indian DPDP Act 2023 Compliance</h2>
      <h3>8.1 Rights Under Indian DPDP Act 2023, GDPR & CCPA</h3>
      <p>Depending on your jurisdiction, you possess the following statutory rights:</p>
      <ul>
        <li><strong>Right to Access & Information:</strong> Obtain a summary of personal data processed by us and the processing activities undertaken.</li>
        <li><strong>Right to Correction & Erasure:</strong> Request correction of inaccurate personal data, completion of incomplete data, or erasure of personal data that is no longer necessary.</li>
        <li><strong>Right of Grievance Redressal:</strong> You have the right to readily available grievance redressal in respect of any act or omission regarding personal data obligations.</li>
        <li><strong>Right to Nominate:</strong> (Under Indian DPDP Act) The right to nominate an individual who shall, in the event of death or incapacity, exercise your data rights.</li>
        <li><strong>Right to Withdraw Consent:</strong> Where processing is based on consent, you may withdraw your consent at any time without affecting the lawfulness of processing before withdrawal.</li>
      </ul>
      <p>To exercise any of these rights, use the in-app account tools or contact our designated Grievance Officer.</p>

      <hr />

      <h2>9. Third-Party Infrastructure, Data Breaches & Liability Limitation</h2>
      <p><strong>Sub-Processor Infrastructure Security:</strong></p>
      <ul>
        <li><strong>Database & Authentication:</strong> Sree AI uses <strong>Supabase Inc.</strong> for managed database and user identity infrastructure. Supabase maintains enterprise-grade security controls (including SOC 2 Type II compliance).</li>
        <li><strong>Object & File Storage:</strong> Sree AI uses <strong>Cloudflare Inc. (Cloudflare R2)</strong> for file and media storage.</li>
        <li><strong>AI Model Execution:</strong> AI completions, embeddings, and transcriptions are processed directly via enterprise API pipelines operated by <strong>NVIDIA Corporation</strong>, <strong>Google LLC</strong>, <strong>Groq LLC</strong>, and <strong>Deepgram Inc.</strong></li>
      </ul>

      <div className={`${styles.callout} ${styles.calloutDanger}`}>
        <AlertTriangle className={styles.calloutIcon} size={20} />
        <div className={styles.calloutContent}>
          <strong>Allocation of Breach Risk & Section 79 IT Act Safe Harbor:</strong>
          <br />To the fullest extent permitted by applicable law (including Section 79 of the Indian Information Technology Act, 2000), <strong>Sree AI and its individual founders/operators shall NOT be held liable for unauthorized access, data leaks, security breaches, server accidents, or system compromises arising directly from vulnerabilities, failures, or breaches occurring within third-party sub-processor infrastructure (Supabase, Cloudflare, Razorpay, or AI model providers)</strong>.
          <br />In the event of a confirmed third-party data breach, we will notify affected users and regulatory authorities (such as the Data Protection Board of India and CERT-In) in compliance with mandatory statutory notification timelines.
        </div>
      </div>

      <hr />

      <h2>10. Cookies and Local Storage</h2>
      <p>Sree AI uses essential cookies and browser local storage mechanisms strictly for:</p>
      <ul>
        <li>Authentication session management (<code>sb-access-token</code>, <code>sb-refresh-token</code>).</li>
        <li>Anonymous visitor identity tracking (<code>sree_anon_id</code>).</li>
        <li>User interface preferences (Dark/Light theme, sidebar collapse state, selected AI models).</li>
        <li>PostHog performance diagnostics and UI telemetry (stripped of PII).</li>
      </ul>
      <p>For complete details, refer to our dedicated <a href="/cookies">Cookie Policy</a>.</p>

      <hr />

      <h2>11. Children's Privacy</h2>
      <p>
        Sree AI is not directed to individuals under the age of 18 (or the age of majority in your jurisdiction). We do not knowingly collect personal information from children. If you become aware that a minor has provided us with personal data, please contact our Grievance Officer immediately for prompt deletion.
      </p>

      <hr />

      <h2>12. International Data Transfers</h2>
      <p>
        Your information may be transferred to, stored, and processed in servers located outside of your country of residence (including India, the United States, and the European Union). Where cross-border data transfers occur, we implement standard contractual safeguards and adhere to lawful transfer mechanisms.
      </p>

      <hr />

      <h2>13. Grievance Officer & Statutory Contact (DPDP Act / IT Act India)</h2>
      <p>In accordance with the <strong>Digital Personal Data Protection Act, 2023</strong> and the <strong>Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021</strong>, the contact details of our designated Grievance Officer are:</p>
      <ul>
        <li><strong>Grievance Officer:</strong> Legal & Privacy Compliance Desk, Sree AI</li>
        <li><strong>Email:</strong> <a href="mailto:privacy@sreeai.qzz.io">privacy@sreeai.qzz.io</a> / <a href="mailto:legal@sreeai.qzz.io">legal@sreeai.qzz.io</a></li>
        <li><strong>Support & Ticket Desk:</strong> <a href="/feature-request">https://app.sreeai.qzz.io/feature-request</a></li>
        <li><strong>Official Website:</strong> <a href="https://sreeai.qzz.io" target="_blank" rel="noreferrer">https://sreeai.qzz.io</a></li>
        <li><strong>Response Timeline:</strong> We acknowledge all grievances within <strong>48 hours</strong> and strive for complete resolution within <strong>thirty (30) days</strong> of receipt.</li>
      </ul>
    </LegalLayout>
  );
};
