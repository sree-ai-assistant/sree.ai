# Privacy Policy — Sree AI

**Effective Date:** August 20, 2026  
**Last Updated:** August 20, 2026  
**Application:** Sree AI (accessible via [https://app.sreeai.qzz.io](https://app.sreeai.qzz.io))

---

## 1. Introduction

Welcome to **Sree AI** ("Company", "we", "our", or "us"). We are committed to protecting your privacy and personal data. This Privacy Policy describes how we collect, use, process, disclose, and safeguard your personal information when you use our multi-modal AI software-as-a-service platform, web application, APIs, and associated services (collectively, the "Services").

By accessing or using Sree AI, you acknowledge that you have read, understood, and agree to the collection and use of your information in accordance with this Privacy Policy and applicable data protection laws, including the **General Data Protection Regulation (GDPR)** (EU/EEA), the **California Consumer Privacy Act (CCPA/CPRA)**, and the **Digital Personal Data Protection (DPDP) Act 2023 / Information Technology Act 2000** (India).

If you do not agree with the terms of this Privacy Policy, please do not access or use the Services.

---

## 2. Information We Collect

### 2.1 Information You Provide Directly to Us
- **Account Registration Data:** When creating an account via Supabase Auth (Email or OAuth providers such as Google/GitHub), we collect your email address, display name, nickname, avatar URL, occupation, and optional onboarding profile details.
- **User Customization & Instructions:** Custom system prompts, tone preferences (`custom_instructions`), and personal background details (`more_about_you`) you choose to supply to customize AI interactions.
- **Chat Inputs & Media Content:** Prompts, text messages, questions, uploaded files (PDFs, Word documents, Excel spreadsheets, images), voice audio recordings, and generated AI assets (images/videos).
- **Bring Your Own Key (BYOK) Credentials:** If you opt into the BYOK feature, you provide external API keys (e.g., NVIDIA, Google Gemini, Groq, Deepgram). These keys are encrypted immediately using AES-256-GCM before database insertion and are never stored in plaintext.
- **Support & Feature Requests:** Information submitted through our ticket system, including your name, email, issue descriptions, and screenshots.

### 2.2 Information Collected Automatically
- **Anonymous Session Identifiers (`anon_id`):** For users who interact with Sree AI without creating an account, we generate a cryptographically random anonymous identifier stored in client cookies/localStorage.
- **Privacy-Preserving Fingerprints & Network Hashes:**
  - **IP Address:** We do **not** store raw, plaintext IP addresses. Raw IP addresses are processed through a salted SHA-256 one-way cryptographic hash for abuse prevention and rate-limiting enforcement.
  - **Browser Fingerprint:** A SHA-256 hash of client screen resolution, browser capabilities, and operating system.
- **Usage & Telemetry Data:** Request timestamps, tool usage frequency (chat completions, image generations, audio transcriptions, token consumption), model selections, latency metrics, and error logs (via PostHog).
- **Device & Session Metadata:** Operating system, browser type, device identifiers, and active session status recorded in `user_sessions` and `trusted_devices` to secure your account.

### 2.3 Payment & Billing Information
- All financial transactions and recurring subscriptions are processed securely by our third-party payment processor, **Razorpay**.
- **We do NOT store or have access to raw credit/debit card numbers, CVVs, or net banking passwords.**
- We only retain payment transaction metadata: Razorpay Payment ID (`pay_xxx`), Subscription ID (`sub_xxx`), Order ID, currency (`INR`), plan tier, and transaction status for accounting and entitlement purposes.

---

## 3. Legal Bases for Processing (GDPR / DPDP Compliance)

We process your personal data under the following lawful bases:
1. **Contractual Necessity (Art. 6(1)(b) GDPR):** To deliver the AI services, manage subscriptions, process inference requests, and fulfill our Terms of Service.
2. **Legitimate Interests (Art. 6(1)(f) GDPR):** To detect abuse, prevent automated spam attacks, secure our infrastructure, monitor platform performance, and optimize AI key pooling.
3. **Consent (Art. 6(1)(a) GDPR):** For optional marketing communications, non-essential cookies, and file upload policy acknowledgments.
4. **Legal Compliance (Art. 6(1)(c) GDPR):** To comply with tax obligations, accounting laws, fraud prevention mandates, and valid legal requests.

---

## 4. How We Use Your Information

We utilize the collected information for the following specific purposes:
- **Service Delivery:** Providing multi-turn conversational chat, voice transcription (STT), voice synthesis (TTS), and image/video generation.
- **Account & Subscription Management:** Tracking plan quotas (Free, Starter, Pro), processing recurring renewals, handling upgrades/downgrades, and managing deferred cycle switches.
- **BYOK Discount Management:** Verifying encrypted user keys and applying the 0.2x quota rate multiplier.
- **Abuse Prevention & Security:** Enforcing rate limits via atomic PostgreSQL RPCs (`increment_multi_usage`), identifying unauthorized multi-account farming, and detecting malicious prompt injections.
- **Data Synchronization on Signup:** Automatically migrating anonymous conversations, rate limit tallies, and preferences to an authenticated account upon user registration via `migrate_anonymous_data`.
- **System Improvements & Observability:** Monitoring API error rates, tracking model response times, and auditing automated cleanup cron operations.

---

## 5. Third-Party Service Providers & Sub-Processors

We share necessary data with trusted sub-processors strictly for technical execution under Data Processing Agreements (DPAs):

| Sub-Processor | Role / Function | Data Shared | Location |
|---|---|---|---|
| **Supabase Inc.** | Cloud Database, Auth & Realtime Engine | User profiles, chat history, encrypted API keys, session logs | Global / US |
| **Razorpay Software Private Limited** | Payment Gateway & Subscription Billing | Billing email, transaction amounts, subscription status | India |
| **Cloudflare Inc. (R2)** | S3-Compatible Media & Document Storage | Uploaded chat attachments, generated AI images/videos | Global |
| **NVIDIA Corporation (NIM)** | AI Model Inference Provider | User prompt text & context (Transient) | US / Global |
| **Google Cloud (Gemini / Veo)** | AI Model & Video Inference Provider | User prompt text, document content (Transient) | US / Global |
| **Groq Inc.** | High-Speed Inference & Whisper STT | Prompts & Audio data (Transient) | US |
| **Deepgram Inc.** | Speech-To-Text (STT) Audio Processing | Audio voice stream recordings (Transient) | US |
| **PostHog Inc.** | Product Analytics & Error Diagnostics | Sanitized interaction telemetry, performance metrics | US / EU |
| **n8n Automation Engine** | Notification & Webhook Automation | Payment failure alerts, feature request tickets | Self-Hosted / Germany |

> **AI Model Processing & Provider Terms Notice:** 
> 1. Sree AI does not sell your personal data or user conversations.
> 2. When you upload files, documents (PDF, DOCX, XLSX), images, or audio prompts during chat, these inputs are transmitted directly to the selected AI provider (e.g., Google LLC, NVIDIA Corporation, Groq LLC, Deepgram Inc.) to execute inference.
> 3. Each AI model provider processes data in accordance with their respective enterprise API terms and privacy policies. While enterprise API endpoints generally do not train on customer inputs, some providers may retain transient logs for safety monitoring or process data under their standard terms. Sree AI disclaims all liability for upstream model provider data handling, retention, or processing practices.

---

## 6. Data Retention & Automatic Cleanup

- **Account Data:** Profile information, subscription records, and BYOK credentials remain stored until you delete your account.
- **Chat & Conversation Logs:** Retained in your account history until manually deleted by you via the user interface.
- **Media & File Attachments:** Uploaded user attachments and generated images/videos stored in Cloudflare R2 are subject to automated storage cleanup policies according to your active subscription tier.
- **Anonymous Data:** Anonymous user records (`anonymous_users`) inactive for over 90 days are automatically purged by scheduled database maintenance scripts (`cleanup_logs`).
- **Account Deletion:** You can delete your account and all associated personal data anytime from the Settings page. Upon deletion, personal profile records, encrypted keys, active sessions, and conversation histories are permanently removed via cascading database deletions (`ON DELETE CASCADE`).

---

## 7. Security Architecture

We implement defense-in-depth technical and organizational measures to safeguard your information:
- **Encryption at Rest:** User BYOK API keys are encrypted using **AES-256-GCM** with individualized cryptographic initialization vectors (`iv`).
- **Encryption in Transit:** All traffic is encrypted using modern **TLS 1.3 / HTTPS** protocols.
- **Database Row Level Security (RLS):** Supabase PostgreSQL RLS policies enforce strict tenant data isolation. Users can only read and mutate rows where `auth.uid() = id` or where the anonymous header matches `anon_id`.
- **Payment Verification:** Webhooks are verified using cryptographic **HMAC-SHA256** signatures with anti-replay idempotency safeguards.
- **Zero Raw PII IP Tracking:** Client IP addresses are never saved in cleartext.

---

## 8. Your Data Protection Rights & Indian DPDP Act 2023 Compliance

### 8.1 Rights Under Indian DPDP Act 2023, GDPR & CCPA
Depending on your jurisdiction, you possess the following statutory rights:
- **Right to Access & Information:** Obtain a summary of personal data processed by us and the processing activities undertaken.
- **Right to Correction & Erasure:** Request correction of inaccurate personal data, completion of incomplete data, or erasure of personal data that is no longer necessary.
- **Right of Grievance Redressal:** You have the right to readily available grievance redressal in respect of any act or omission regarding personal data obligations.
- **Right to Nominate:** (Under Indian DPDP Act) The right to nominate an individual who shall, in the event of death or incapacity, exercise your data rights.
- **Right to Withdraw Consent:** Where processing is based on consent, you may withdraw your consent at any time without affecting the lawfulness of processing before withdrawal.

To exercise any of these rights, use the in-app account tools or contact our designated Grievance Officer.

---

## 9. Third-Party Infrastructure, Data Breaches & Liability Limitation

1. **Sub-Processor Infrastructure Security:**
   - **Database & Authentication:** Sree AI uses **Supabase Inc.** for managed database and user identity infrastructure. Supabase maintains enterprise-grade security controls (including SOC 2 Type II compliance).
   - **Object & File Storage:** Sree AI uses **Cloudflare Inc. (Cloudflare R2)** for file and media storage.
   - **AI Model Execution:** AI completions, embeddings, and transcriptions are processed directly via enterprise API pipelines operated by **NVIDIA Corporation**, **Google LLC**, **Groq LLC**, and **Deepgram Inc.**
2. **Allocation of Breach Risk:**
   - Sree AI implements reasonable technical and organizational security measures. However, no internet transmission or cloud storage system is 100% secure.
   - To the fullest extent permitted by applicable law (including Section 79 of the Indian Information Technology Act, 2000), **Sree AI and its individual founders/operators shall NOT be held liable for unauthorized access, data leaks, security breaches, server accidents, or system compromises arising directly from vulnerabilities, failures, or breaches occurring within third-party sub-processor infrastructure (Supabase, Cloudflare, Razorpay, or AI model providers)**.
   - In the event of a confirmed third-party data breach, we will notify affected users and regulatory authorities (such as the Data Protection Board of India and CERT-In) in compliance with mandatory statutory notification timelines.
3. **User-Controlled Risk & BYOK:**
   - Users who provide third-party API keys (BYOK) or upload unencrypted confidential files bear sole and exclusive responsibility for the sensitivity, security, and authorization of such data.

---

## 10. Cookies and Local Storage

Sree AI uses essential cookies and browser local storage mechanisms strictly for:
- Authentication session management (`sb-access-token`, `sb-refresh-token`).
- Anonymous visitor identity tracking (`sree_anon_id`).
- User interface preferences (Dark/Light theme, sidebar collapse state, selected AI models).

You can manage or disable cookies through your browser settings; however, disabling essential cookies may degrade or prevent core authentication and chat capabilities.

---

## 11. Children's Privacy

Sree AI is not directed to individuals under the age of 18 (or the age of majority in your jurisdiction). We do not knowingly collect personal information from children. If you become aware that a minor has provided us with personal data, please contact our Grievance Officer immediately for prompt deletion.

---

## 12. International Data Transfers

Your information may be transferred to, stored, and processed in servers located outside of your country of residence (including India, the United States, and the European Union). Where cross-border data transfers occur, we implement standard contractual safeguards and adhere to lawful transfer mechanisms.

---

## 13. Grievance Officer & Statutory Contact (DPDP Act / IT Act India)

In accordance with the **Digital Personal Data Protection Act, 2023** and the **Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021**, the contact details of our designated Grievance Officer are:

- **Grievance Officer:** Legal & Privacy Compliance Desk, Sree AI
- **Email:** `privacy@sreeai.qzz.io` / `legal@sreeai.qzz.io`
- **Support & Ticket Desk:** [https://app.sreeai.qzz.io/feature-request](https://app.sreeai.qzz.io/feature-request)
- **Official Portal:** [https://sreeai.qzz.io](https://sreeai.qzz.io)
- **Response Timeline:** We acknowledge all grievances within 48 hours and strive for complete resolution within thirty (30) days of receipt.
