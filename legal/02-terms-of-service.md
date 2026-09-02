# Terms of Service — Sree AI

**Effective Date:** August 20, 2026  
**Last Updated:** August 20, 2026  
**Application:** Sree AI (accessible via [https://app.sreeai.qzz.io](https://app.sreeai.qzz.io))

---

## 1. Acceptance of Terms

These Terms of Service ("Terms", "Agreement") constitute a legally binding agreement between you ("User", "you", or "your") and **Sree AI** ("Company", "we", "us", or "our"), governing your access to and use of the Sree AI web application, APIs, multi-modal conversational AI tools, image and video generation tools, voice assistant services, and recurring subscriptions (collectively, the "Services").

**BY ACCESSING, REGISTERING FOR, OR USING THE SERVICES, YOU AGREE TO BE BOUND BY THESE TERMS AND OUR PRIVACY POLICY. IF YOU DO NOT AGREE WITH ALL OF THESE TERMS, YOU ARE EXPRESSLY PROHIBITED FROM USING THE SERVICES AND MUST DISCONTINUE USE IMMEDIATELY.**

---

## 2. Eligibility & Account Registration

### 2.1 Age Requirements
You must be at least **18 years old** (or the legal age of majority in your jurisdiction) to use Sree AI. By using the Services, you represent and warrant that you meet this age requirement.

### 2.2 Account Security
- You may register via Supabase Auth using email/password or authorized third-party OAuth providers (e.g., Google, GitHub).
- You are solely responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account.
- You agree to notify us immediately at **security@sreeai.qzz.io** if you suspect any unauthorized access or breach of security.

### 2.3 Anonymous Guest Access
Sree AI permits limited interactions as an unregistered guest user. Anonymous sessions are governed by these Terms and our rate-limiting enforcement policies. We reserve the right to restrict or terminate anonymous access at any time to preserve system integrity.

---

## 3. Subscription Plans, Billing & Payment Terms

### 3.1 Tier Structure & Quotas
Sree AI offers three primary tiers:
- **Free Plan:** Basic daily usage limits, standard AI models, and limited file upload sizes.
- **Starter Plan:** Enhanced daily/monthly request limits, premium reasoning models, higher upload limits, and priority processing.
- **Pro Plan:** Maximum request limits, elite models (e.g., Nemotron, Gemini Omni, FLUX.1), advanced video generation, extended upload thresholds (up to 250 MB), and dedicated support.

### 3.2 Payment Processor & Billing Cycles
- Subscriptions are billed in advance on a recurring monthly or annual basis via our authorized payment gateway, **Razorpay**.
- By subscribing to a paid tier, you authorize Razorpay to automatically charge your designated payment method at each recurring billing cycle start until you explicitly cancel.

### 3.3 Upgrades, Downgrades & Deferred Switches
- **Instant Upgrades:** Upgrading to a higher tier triggers an immediate checkout session. Upon payment confirmation via webhook, new plan quotas and capabilities are unlocked immediately.
- **Deferred Downgrades / Switches:** If you choose to switch to a lower plan tier, the downgrade is scheduled to take effect at the conclusion of your current active billing cycle (`upcoming_tier` / `upcoming_start_date`), ensuring you retain full access to the features you paid for.
- **Plan Rollback on Payment Failure:** If a recurring renewal or deferred subscription payment fails after automated retries, the system will gracefully transition your account to the Free tier while preserving your historical chat data.

### 3.4 Cancellation Policy
- You may cancel your subscription at any time via the **Billing & Subscription** section in your account settings.
- Cancellation takes effect at the end of the current paid billing period (`cancel_at_cycle_end = true`). No further charges will occur, and you will maintain paid tier access until the cycle expires.

### 3.5 Refund Policy
Except where required by applicable consumer protection laws, subscription payments are non-refundable once billed. Please refer to our [Refund and Cancellation Policy](04-refund-and-cancellation-policy.md) for full details regarding dispute handling and refund eligibility.

---

## 4. Bring Your Own Key (BYOK) Terms

Sree AI allows users to provide their own third-party API keys (e.g., NVIDIA NIM, Google Gemini, Groq, Deepgram) to unlock enhanced quotas and a **0.2x usage multiplier**:

1. **Direct Third-Party Billing:** When utilizing BYOK, you are directly responsible for all third-party API fees, token costs, and rate limits incurred on your personal provider accounts.
2. **Key Security & Encryption:** We encrypt your API keys using **AES-256-GCM** before database storage. Keys are decrypted transiently strictly to route your specific inference requests.
3. **No Key Sharing:** You warrant that any API key you submit is legitimately owned by you and does not violate the terms of service of the respective provider.
4. **Revocation:** You may delete or update your BYOK keys at any time through the Settings page.

---

## 5. Intellectual Property & AI-Generated Content

### 5.1 Your Input & Content
You retain all ownership rights in the prompts, text, images, audio recordings, documents, and data you submit to the Services ("User Content"). You grant Sree AI a worldwide, non-exclusive, royalty-free license to host, process, and transmit your User Content solely to the extent necessary to deliver the Services to you.

### 5.2 AI Output Ownership & Licensing
To the maximum extent permitted by applicable intellectual property law:
- As between you and Sree AI, you own all outputs (text responses, generated images, synthesized speech, generated videos) generated in response to your prompts ("Output Content").
- You are free to use your Output Content for personal, academic, or commercial purposes.

### 5.3 Nature of AI Outputs & Disclaimers
- **Probabilistic Technology:** AI models generate responses using statistical pattern matching. Outputs may occasionally be inaccurate, incomplete, misleading, or offensive ("Hallucinations").
- **No Professional Advice:** Outputs provided by Sree AI do not constitute legal, medical, financial, investment, or certified technical advice. You must independently evaluate and verify all outputs before relying on them.
- **Similarity of Outputs:** Due to the nature of machine learning, outputs generated for you may be similar or identical to outputs generated for other users submitting similar prompts.

---

## 6. Acceptable Use Policy & Prohibited Conduct

You agree that you will **NOT** use Sree AI to:
1. Generate, transmit, or promote illegal content, child sexual abuse material (CSAM), non-consensual sexual content, terrorism, hate speech, or content inciting violence.
2. Generate malicious code, viruses, trojans, exploit payloads, or conduct unauthorized vulnerability scanning or denial-of-service (DoS) attacks.
3. Attempt to reverse engineer, decompile, disassemble, or extract source code from the platform or its proprietary rate-limiting algorithms.
4. Circumvent, exploit, or bypass platform rate limits, token quotas, multi-account abuse guards, or security middlewares (`abuseDetectionMiddleware`).
5. Use automated scripts, scrapers, bots, or crawlers to harvest data from the Services without our explicit written consent.
6. Infringe upon the copyright, trademark, trade secret, or privacy rights of any third party.
7. Impersonate any person, brand, or entity, or misrepresent an AI-generated output as being authored by a certified human expert in critical decision-making contexts.

Violation of this Section may result in immediate suspension, permanent account ban, and reporting to law enforcement authorities without refund.

---

## 7. Service Availability, Modifications & Rate Limiting

1. **Uptime & SLAs:** We strive for continuous availability but do not guarantee uninterrupted, error-free, or zero-downtime operation. Maintenance, updates, or provider outages may cause temporary service interruptions.
2. **Quota Enforcement:** All users are subject to rate limiting enforced per minute, day, and billing month via atomic database RPCs. Exceeding limits will return HTTP `429 Too Many Requests`.
3. **Modifications:** We reserve the right to modify, update, replace, or discontinue specific AI models, features, or tools at our sole discretion with or without notice.

---

## 8. Termination & Account Deletion

1. **Termination by You:** You may terminate this Agreement at any time by canceling your subscription and permanently deleting your account in the Settings dashboard.
2. **Termination by Sree AI:** We reserve the right to suspend or terminate your account immediately if you violate these Terms, engage in fraud, abuse platform resources, or fail to settle subscription fees.
3. **Effect of Termination:** Upon account deletion, all personal data, chat history, and encrypted BYOK keys will be permanently purged in accordance with our Privacy Policy.

---

## 9. Disclaimer of Warranties & Absolute Assumption of Risk

1. **"AS-IS" and "AS-AVAILABLE" Provision:**
   THE SERVICES ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, TIMELINESS, OR CONTINUOUS AVAILABILITY.
2. **Third-Party Infrastructure & AI Model Dependency:**
   - **Database & Authentication Hosting:** User accounts, authentication sessions, and metadata are hosted on cloud infrastructure managed by **Supabase Inc.** Any database outage, unauthorized intrusion, data loss, or server corruption occurring at the database level is subject exclusively to Supabase's service availability terms and infrastructure security.
   - **AI Model Execution & Inference:** AI responses, vision processing, audio transcriptions, and video synthesis are executed via third-party enterprise APIs operated by **NVIDIA Corporation**, **Google LLC / Alphabet**, **Groq LLC**, and **Deepgram Inc.** Sree AI does not control or guarantee the internal model logic, training datasets, or factual accuracy of third-party model outputs.
3. **User-Uploaded Files, Media, Documents & AI Provider Transmission:**
   - You acknowledge that uploading files (PDFs, Word documents, spreadsheets, images, audio) and connecting third-party API keys (BYOK) carries inherent internet and third-party processing risks.
   - When you upload documents or images during chat, they are transmitted to external AI model providers (Google LLC, NVIDIA Corporation, Groq LLC, Deepgram Inc.) to execute inference, vision analysis, or parsing. Upstream providers handle and process data in accordance with their respective terms of service and developer policies.
   - **YOU BEAR 100% SOLE RESPONSIBILITY AND LIABILITY FOR ALL CONTENT UPLOADED TO SREE AI.**
   - Sree AI shall have zero liability for how third-party AI providers process, cache, inspect for safety, or retain uploaded data, or if confidential, proprietary, or sensitive data uploaded by you is subjected to accidental exposure or third-party intercept.

---

## 10. Limitation of Liability & Intermediary Safe Harbor (IT Act Section 79)

1. **Intermediary Status (India IT Act 2000):**
   Sree AI operates as an **Intermediary** under **Section 79 of the Information Technology Act, 2000** and the **IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021**. Sree AI does not initiate the transmission, select the receiver of the transmission, or modify the information contained in AI user transmissions. Sree AI is entitled to the full protections of statutory safe harbor for all third-party and user-generated content.
2. **Absolute Zero-Liability for Data Leaks & Accidents:**
   **TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL SREE AI, ITS FOUNDERS, OPERATORS, DIRECTORS, AFFILIATES, AGENTS, OR EMPLOYEES BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:**
   - **DATA BREACHES, DATA LEAKS, UNAUTHORIZED DATABASE ACCESS, OR ACCIDENTAL SERVER LOSS ARISING FROM THIRD-PARTY CLOUD VULNERABILITIES (INCLUDING SUPABASE, CLOUDFLARE, OR RAZORPAY);**
   - **ERRORS, INACCURACIES, COPYRIGHT INFRINGEMENTS, OR HALLUCINATIONS PRODUCED BY UNDERLYING AI MODELS (NVIDIA, GOOGLE, GROQ, DEEPGRAM);**
   - **THIRD-PARTY API CHARGES, BILLING OVERAGES, OR KEY REVOCATIONS INCURRED ON YOUR PERSONAL BYOK ACCOUNTS;**
   - **BUSINESS INTERRUPTION, LOSS OF PROFITS, GOODWILL, WORK STOPPAGE, OR SYSTEM CRASHES.**
3. **Aggregate Liability Cap:**
   If, notwithstanding the foregoing, liability is imposed upon Sree AI by a court of competent jurisdiction, our total aggregate liability for all claims shall be strictly capped at the lesser of (A) the total subscription fees actually paid by you to Sree AI in the three (3) months immediately preceding the event, or (B) ₹1,000 INR (One Thousand Indian Rupees).

---

## 11. Indemnification

**YOU AGREE TO DEFEND, INDEMNIFY, AND HOLD HARMLESS SREE AI, ITS FOUNDERS, OPERATORS, DIRECTORS, EMPLOYEES, AND AGENTS FROM AND AGAINST ANY AND ALL CLAIMS, DEMANDS, LIABILITIES, DAMAGES, LOSSES, COSTS, AND EXPENSES (INCLUDING REASONABLE LEGAL FEES) ARISING OUT OF OR IN ANY WAY CONNECTED WITH:**
1. **Your User Content, uploaded documents, audio recordings, or media files;**
2. **Your use or misuse of AI outputs in professional, legal, medical, or financial contexts;**
3. **Your violation of these Terms or any applicable statutory regulation (including the Indian DPDP Act 2023, IT Act 2000, GDPR, or CCPA);**
4. **Any claim that your User Content or prompts infringed upon the copyright, privacy, or trade secret rights of a third party.**

---

## 12. Governing Law & Dispute Resolution

### 12.1 Governing Law
These Terms shall be governed by, interpreted, and construed in accordance with the laws of the **Republic of India**, without regard to its conflict of law principles.

### 12.2 Dispute Resolution & Arbitration
Any dispute, controversy, or claim arising out of or relating to this contract, including the formation or breach thereof, shall be settled by binding arbitration in accordance with the **Arbitration and Conciliation Act, 1996** (India). 
- **Arbitration Venue:** Bhubaneswar / Bengaluru, India.
- **Language:** English.
- **Arbitrator:** A sole arbitrator mutually appointed by the parties.
- The arbitral award shall be final and binding upon both parties.

---

## 13. Changes to These Terms

We reserve the right to revise and update these Terms at our discretion. We will notify you of any material changes by updating the "Last Updated" date and posting a notice within the web application. Your continued use of Sree AI after any modifications constitutes your acceptance of the updated Terms.

---

## 14. Grievance Redressal & Statutory Contact

For legal inquiries, dispute notifications, or statutory grievances under the **Digital Personal Data Protection Act, 2023** or **IT Act, 2000**, please contact:

- **Grievance Desk:** Legal Compliance Department, Sree AI
- **Email:** `legal@sreeai.qzz.io` / `privacy@sreeai.qzz.io`
- **Support & Ticket Portal:** [https://app.sreeai.qzz.io/feature-request](https://app.sreeai.qzz.io/feature-request)
- **Official Website:** [https://sreeai.qzz.io](https://sreeai.qzz.io)
