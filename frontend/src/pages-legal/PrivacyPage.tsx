import React from 'react';
import { LegalLayout } from './LegalLayout';

export const PrivacyPage: React.FC = () => {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="How Sree AI collects, processes, encrypts, and protects your personal information in compliance with the Indian DPDP Act 2023, GDPR, and CCPA."
      badge="Privacy & Data Protection"
      lastUpdated="August 20, 2026"
    >
      <h2>1. Introduction</h2>
      <p>
        Welcome to <strong>Sree AI</strong> ("Company", "we", "our", or "us"). We are committed to protecting your privacy and personal data. This Privacy Policy describes how we collect, use, process, disclose, and safeguard your personal information when you use our multi-modal AI software-as-a-service platform, web application, APIs, and associated services (collectively, the "Services").
      </p>
      <p>
        By accessing or using Sree AI, you agree to the collection and use of your information in accordance with this Privacy Policy and applicable data protection laws, including the <strong>General Data Protection Regulation (GDPR)</strong> (EU/EEA), the <strong>California Consumer Privacy Act (CCPA/CPRA)</strong>, and the <strong>Digital Personal Data Protection (DPDP) Act 2023 / Information Technology Act 2000</strong> (India).
      </p>

      <hr />

      <h2>2. Information We Collect</h2>
      <h3>2.1 Information You Provide Directly</h3>
      <ul>
        <li><strong>Account Registration Data:</strong> Email address, display name, nickname, avatar URL, occupation, and optional onboarding profile details via Supabase Auth.</li>
        <li><strong>User Instructions:</strong> Custom system prompts (<code>custom_instructions</code>) and background details (<code>more_about_you</code>).</li>
        <li><strong>Chat Inputs & Media:</strong> Prompts, text messages, uploaded files (PDFs, Word documents, Excel spreadsheets, images), voice audio recordings, and generated AI images/videos.</li>
        <li><strong>Bring Your Own Key (BYOK) Credentials:</strong> External API keys (e.g., NVIDIA, Google Gemini, Groq, Deepgram) encrypted immediately with AES-256-GCM.</li>
      </ul>

      <h3>2.2 Information Collected Automatically (Zero Raw IP Storage)</h3>
      <ul>
        <li><strong>Anonymous Session Identifiers (<code>anon_id</code>):</strong> Cryptographically random anonymous identifiers stored in client cookies/localStorage.</li>
        <li><strong>Salted IP & Fingerprint Hashes:</strong> We do <strong>not</strong> store raw IP addresses. IPs are processed through a salted SHA-256 one-way cryptographic hash for rate-limiting enforcement.</li>
        <li><strong>Telemetry:</strong> Sanitized interaction telemetry, model selections, and latency metrics via PostHog.</li>
      </ul>

      <h3>2.3 Payment Information</h3>
      <p>All financial transactions are processed securely by <strong>Razorpay</strong>. We do NOT store or have access to raw credit/debit card numbers, CVVs, or net banking passwords.</p>

      <hr />

      <h2>3. Third-Party Service Providers & Sub-Processors</h2>
      <p>We share necessary data with trusted sub-processors strictly for technical execution:</p>
      <table>
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
            <td><strong>Razorpay Software Pvt Ltd</strong></td>
            <td>Payment Gateway & Billing</td>
            <td>Billing email, transaction amounts, subscription status</td>
            <td>India</td>
          </tr>
          <tr>
            <td><strong>Cloudflare Inc. (R2)</strong></td>
            <td>S3-Compatible Object Storage</td>
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
            <td>AI Model & Video Inference</td>
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
            <td>Speech-To-Text (STT) Processing</td>
            <td>Audio voice stream recordings (Transient)</td>
            <td>US</td>
          </tr>
          <tr>
            <td><strong>PostHog Inc.</strong></td>
            <td>Analytics & Diagnostics</td>
            <td>Sanitized telemetry & error logs</td>
            <td>US / EU</td>
          </tr>
        </tbody>
      </table>

      <blockquote>
        <strong>AI Model Processing & Provider Terms Notice:</strong><br />
        1. Sree AI does not sell your personal data or user conversations.<br />
        2. When you upload files, documents (PDF, DOCX, XLSX), images, or audio prompts during chat, these inputs are transmitted directly to the selected AI provider (Google, NVIDIA, Groq, Deepgram) to execute inference.<br />
        3. Each AI model provider processes data in accordance with their respective enterprise API terms and privacy policies. Sree AI disclaims all liability for upstream model provider data handling, retention, or processing practices.
      </blockquote>

      <hr />

      <h2>4. Third-Party Infrastructure, Data Breaches & Liability Limitation</h2>
      <p>
        <strong>Sub-Processor Infrastructure Security:</strong> Database and user identity infrastructure are managed by <strong>Supabase Inc.</strong>, object storage by <strong>Cloudflare Inc.</strong>, payment processing by <strong>Razorpay</strong>, and AI model execution by <strong>NVIDIA, Google, Groq, and Deepgram</strong>.
      </p>
      <p>
        <strong>Allocation of Breach Risk:</strong> To the fullest extent permitted by applicable law (including Section 79 of the Indian Information Technology Act, 2000), <strong>Sree AI and its individual founders/operators shall NOT be held liable for unauthorized access, data leaks, security breaches, server accidents, or system compromises arising directly from vulnerabilities or failures occurring within third-party sub-processor infrastructure</strong>.
      </p>

      <hr />

      <h2>5. Your Data Protection Rights (Indian DPDP Act 2023, GDPR & CCPA)</h2>
      <ul>
        <li><strong>Right to Access & Information:</strong> Obtain a summary of personal data processed by us.</li>
        <li><strong>Right to Correction & Erasure:</strong> Request correction of inaccurate data or deletion of your account.</li>
        <li><strong>Right of Grievance Redressal:</strong> Accessible resolution regarding data obligations.</li>
        <li><strong>Right to Nominate:</strong> (Under Indian DPDP Act) Nominate an individual to exercise your data rights in the event of death or incapacity.</li>
      </ul>

      <hr />

      <h2>6. Grievance Officer & Statutory Contact (DPDP Act India)</h2>
      <ul>
        <li><strong>Grievance Officer:</strong> Legal & Privacy Compliance Desk, Sree AI</li>
        <li><strong>Email:</strong> <a href="mailto:privacy@sreeai.qzz.io">privacy@sreeai.qzz.io</a> / <a href="mailto:legal@sreeai.qzz.io">legal@sreeai.qzz.io</a></li>
        <li><strong>Support & Ticket Desk:</strong> <a href="/feature-request">Submit a Ticket</a></li>
        <li><strong>Response Timeline:</strong> Acknowledgment within 48 hours; resolution within 30 days.</li>
      </ul>
    </LegalLayout>
  );
};
