import React from 'react';
import { LegalLayout } from './LegalLayout';
import { Scale, AlertTriangle, ShieldCheck, CheckCircle2, FileText, Lock, Globe } from 'lucide-react';
import styles from './LegalLayout.module.css';

export const TermsPage: React.FC = () => {
  return (
    <LegalLayout
      title="Terms of Service"
      subtitle="The binding legal agreement governing your access, usage, subscriptions, BYOK, and multi-modal AI capabilities on Sree AI."
      badge="Terms of Service"
      lastUpdated="August 20, 2026"
    >
      <div className={styles.callout}>
        <Scale className={styles.calloutIcon} size={20} />
        <div className={styles.calloutContent}>
          <strong>Binding Legal Agreement:</strong> By accessing, registering for, or interacting with Sree AI, you enter into a legally enforceable contract under the laws of the Republic of India and agree to all terms, policies, and risk disclaimers herein.
        </div>
      </div>

      <h2>1. Acceptance of Terms</h2>
      <p>
        These Terms of Service ("Terms", "Agreement") constitute a legally binding agreement between you ("User", "you", or "your") and <strong>Sree AI</strong> ("Company", "we", "us", or "our"), governing your access to and use of the Sree AI web application, APIs, multi-modal conversational AI tools, image and video generation tools, voice assistant services, and recurring subscriptions (collectively, the "Services").
      </p>
      <p>
        <strong>BY ACCESSING, REGISTERING FOR, OR USING THE SERVICES, YOU AGREE TO BE BOUND BY THESE TERMS AND OUR PRIVACY POLICY. IF YOU DO NOT AGREE WITH ALL OF THESE TERMS, YOU ARE EXPRESSLY PROHIBITED FROM USING THE SERVICES AND MUST DISCONTINUE USE IMMEDIATELY.</strong>
      </p>

      <hr />

      <h2>2. Eligibility & Account Registration</h2>
      <h3>2.1 Age Requirements</h3>
      <p>You must be at least <strong>18 years old</strong> (or the legal age of majority in your jurisdiction) to use Sree AI. By using the Services, you represent and warrant that you meet this age requirement.</p>

      <h3>2.2 Account Security</h3>
      <ul>
        <li>You may register via Supabase Auth using email/password or authorized third-party OAuth providers (e.g., Google, GitHub).</li>
        <li>You are solely responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account.</li>
        <li>You agree to notify us immediately at <a href="mailto:security@sreeai.qzz.io">security@sreeai.qzz.io</a> if you suspect any unauthorized access or breach of security.</li>
      </ul>

      <h3>2.3 Anonymous Guest Access</h3>
      <p>Sree AI permits limited interactions as an unregistered guest user. Anonymous sessions are governed by these Terms and our rate-limiting enforcement policies. We reserve the right to restrict or terminate anonymous access at any time to preserve system integrity.</p>

      <hr />

      <h2>3. Subscription Plans, Billing & Payment Terms</h2>
      <h3>3.1 Tier Structure & Quotas</h3>
      <ul>
        <li><strong>Free Plan:</strong> Basic daily usage limits, standard AI models, and limited file upload sizes.</li>
        <li><strong>Starter Plan:</strong> Enhanced daily/monthly request limits, premium reasoning models, higher upload limits, and priority processing.</li>
        <li><strong>Pro Plan:</strong> Maximum request limits, elite models (e.g., Nemotron, Gemini Omni, FLUX.1), advanced video generation, extended upload thresholds (up to 250 MB), and dedicated support.</li>
      </ul>

      <h3>3.2 Payment Processor & Billing Cycles</h3>
      <ul>
        <li>Subscriptions are billed in advance on a recurring monthly or annual basis via our authorized payment gateway, <strong>Razorpay</strong>.</li>
        <li>By subscribing to a paid tier, you authorize Razorpay to automatically charge your designated payment method at each recurring billing cycle start until you explicitly cancel.</li>
      </ul>

      <h3>3.3 Upgrades, Downgrades & Deferred Switches</h3>
      <ul>
        <li><strong>Instant Upgrades:</strong> Upgrading to a higher tier triggers an immediate checkout session. Upon payment confirmation via webhook, new plan quotas and capabilities are unlocked immediately.</li>
        <li><strong>Deferred Downgrades / Switches:</strong> If you choose to switch to a lower plan tier, the downgrade is scheduled to take effect at the conclusion of your current active billing cycle (<code>upcoming_tier</code> / <code>upcoming_start_date</code>), ensuring you retain full access to the features you paid for.</li>
        <li><strong>Plan Rollback on Payment Failure:</strong> If a recurring renewal or deferred subscription payment fails after automated retries, the system will gracefully transition your account to the Free tier while preserving your historical chat data.</li>
      </ul>

      <h3>3.4 Cancellation Policy</h3>
      <ul>
        <li>You may cancel your subscription at any time via the <strong>Billing & Subscription</strong> section in your account settings.</li>
        <li>Cancellation takes effect at the end of the current paid billing period (<code>cancel_at_cycle_end = true</code>). No further charges will occur, and you will maintain paid tier access until the cycle expires.</li>
      </ul>

      <h3>3.5 Refund Policy</h3>
      <p>Except where required by applicable consumer protection laws, subscription payments are non-refundable once billed. Please refer to our <a href="/refund-policy">Refund and Cancellation Policy</a> for full details regarding dispute handling and refund eligibility.</p>

      <hr />

      <h2>4. Bring Your Own Key (BYOK) Terms</h2>
      <p>Sree AI allows users to provide their own third-party API keys (e.g., NVIDIA NIM, Google Gemini, Groq, Deepgram) to unlock enhanced quotas and a <strong>0.2x usage multiplier</strong>:</p>
      <ol>
        <li><strong>Direct Third-Party Billing:</strong> When utilizing BYOK, you are directly responsible for all third-party API fees, token costs, and rate limits incurred on your personal provider accounts.</li>
        <li><strong>Key Security & Encryption:</strong> We encrypt your API keys using <strong>AES-256-GCM</strong> before database storage. Keys are decrypted transiently strictly to route your specific inference requests.</li>
        <li><strong>No Key Sharing:</strong> You warrant that any API key you submit is legitimately owned by you and does not violate the terms of service of the respective provider.</li>
        <li><strong>Revocation:</strong> You may delete or update your BYOK keys at any time through the Settings page.</li>
      </ol>

      <hr />

      <h2>5. Intellectual Property & AI-Generated Content</h2>
      <h3>5.1 Your Input & Content</h3>
      <p>You retain all ownership rights in the prompts, text, images, audio recordings, documents, and data you submit to the Services ("User Content"). You grant Sree AI a worldwide, non-exclusive, royalty-free license to host, process, and transmit your User Content solely to the extent necessary to deliver the Services to you.</p>

      <h3>5.2 AI Output Ownership & Licensing</h3>
      <p>To the maximum extent permitted by applicable intellectual property law:</p>
      <ul>
        <li>As between you and Sree AI, you own all outputs (text responses, generated images, synthesized speech, generated videos) generated in response to your prompts ("Output Content").</li>
        <li>You are free to use your Output Content for personal, academic, or commercial purposes.</li>
      </ul>

      <h3>5.3 Nature of AI Outputs & Disclaimers</h3>
      <ul>
        <li><strong>Probabilistic Technology:</strong> AI models generate responses using statistical pattern matching. Outputs may occasionally be inaccurate, incomplete, misleading, or offensive ("Hallucinations").</li>
        <li><strong>No Professional Advice:</strong> Outputs provided by Sree AI do not constitute legal, medical, financial, investment, or certified technical advice. You must independently evaluate and verify all outputs before relying on them.</li>
        <li><strong>Similarity of Outputs:</strong> Due to the nature of machine learning, outputs generated for you may be similar or identical to outputs generated for other users submitting similar prompts.</li>
      </ul>

      <hr />

      <h2>6. Acceptable Use Policy & Prohibited Conduct</h2>
      <p>You agree that you will <strong>NOT</strong> use Sree AI to:</p>
      <ol>
        <li>Generate, transmit, or promote illegal content, child sexual abuse material (CSAM), non-consensual sexual content, terrorism, hate speech, or content inciting violence.</li>
        <li>Generate malicious code, viruses, trojans, exploit payloads, or conduct unauthorized vulnerability scanning or denial-of-service (DoS) attacks.</li>
        <li>Attempt to reverse engineer, decompile, disassemble, or extract source code from the platform or its proprietary rate-limiting algorithms.</li>
        <li>Circumvent, exploit, or bypass platform rate limits, token quotas, multi-account abuse guards, or security middlewares (<code>abuseDetectionMiddleware</code>).</li>
        <li>Use automated scripts, scrapers, bots, or crawlers to harvest data from the Services without our explicit written consent.</li>
        <li>Infringe upon the copyright, trademark, trade secret, or privacy rights of any third party.</li>
        <li>Impersonate any person, brand, or entity, or misrepresent an AI-generated output as being authored by a certified human expert in critical decision-making contexts.</li>
      </ol>

      <hr />

      <h2>7. Service Availability, Modifications & Rate Limiting</h2>
      <ol>
        <li><strong>Uptime & SLAs:</strong> We strive for continuous availability but do not guarantee uninterrupted, error-free, or zero-downtime operation. Maintenance, updates, or provider outages may cause temporary service interruptions.</li>
        <li><strong>Quota Enforcement:</strong> All users are subject to rate limiting enforced per minute, day, and billing month via atomic database RPCs. Exceeding limits will return HTTP <code>429 Too Many Requests</code>.</li>
        <li><strong>Modifications:</strong> We reserve the right to modify, update, replace, or discontinue specific AI models, features, or tools at our sole discretion with or without notice.</li>
      </ol>

      <hr />

      <h2>8. Termination & Account Deletion</h2>
      <ol>
        <li><strong>Termination by You:</strong> You may terminate this Agreement at any time by canceling your subscription and permanently deleting your account in the Settings dashboard.</li>
        <li><strong>Termination by Sree AI:</strong> We reserve the right to suspend or terminate your account immediately if you violate these Terms, engage in fraud, abuse platform resources, or fail to settle subscription fees.</li>
        <li><strong>Effect of Termination:</strong> Upon account deletion, all personal data, chat history, and encrypted BYOK keys will be permanently purged in accordance with our Privacy Policy.</li>
      </ol>

      <hr />

      <h2>9. Disclaimer of Warranties & Absolute Assumption of Risk</h2>
      <ol>
        <li>
          <strong>"AS-IS" and "AS-AVAILABLE" Provision:</strong>
          THE SERVICES ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, TIMELINESS, OR CONTINUOUS AVAILABILITY.
        </li>
        <li>
          <strong>Third-Party Infrastructure & AI Model Dependency:</strong>
          <ul>
            <li><strong>Database & Authentication Hosting:</strong> User accounts, authentication sessions, and metadata are hosted on cloud infrastructure managed by <strong>Supabase Inc.</strong> Any database outage, unauthorized intrusion, data loss, or server corruption occurring at the database level is subject exclusively to Supabase's service availability terms and infrastructure security.</li>
            <li><strong>AI Model Execution & Inference:</strong> AI responses, vision processing, audio transcriptions, and video synthesis are executed via third-party enterprise APIs operated by <strong>NVIDIA Corporation</strong>, <strong>Google LLC / Alphabet</strong>, <strong>Groq LLC</strong>, and <strong>Deepgram Inc.</strong> Sree AI does not control or guarantee the internal model logic, training datasets, or factual accuracy of third-party model outputs.</li>
          </ul>
        </li>
        <li>
          <strong>User-Uploaded Files, Media, Documents & AI Provider Transmission:</strong>
          <ul>
            <li>You acknowledge that uploading files (PDFs, Word documents, spreadsheets, images, audio) and connecting third-party API keys (BYOK) carries inherent internet and third-party processing risks.</li>
            <li>When you upload documents or images during chat, they are transmitted to external AI model providers (Google LLC, NVIDIA Corporation, Groq LLC, Deepgram Inc.) to execute inference, vision analysis, or parsing. Upstream providers handle and process data in accordance with their respective terms of service and developer policies.</li>
            <li><strong>YOU BEAR 100% SOLE RESPONSIBILITY AND LIABILITY FOR ALL CONTENT UPLOADED TO SREE AI.</strong></li>
            <li>Sree AI shall have zero liability for how third-party AI providers process, cache, inspect for safety, or retain uploaded data, or if confidential, proprietary, or sensitive data uploaded by you is subjected to accidental exposure or third-party intercept.</li>
          </ul>
        </li>
      </ol>

      <hr />

      <h2>10. Limitation of Liability & Intermediary Safe Harbor (IT Act Section 79)</h2>
      <ol>
        <li>
          <strong>Intermediary Status (India IT Act 2000):</strong>
          Sree AI operates as an <strong>Intermediary</strong> under <strong>Section 79 of the Information Technology Act, 2000</strong> and the <strong>IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021</strong>. Sree AI does not initiate the transmission, select the receiver of the transmission, or modify the information contained in AI user transmissions. Sree AI is entitled to the full protections of statutory safe harbor for all third-party and user-generated content.
        </li>
        <li>
          <div className={`${styles.callout} ${styles.calloutDanger}`}>
            <AlertTriangle className={styles.calloutIcon} size={20} />
            <div className={styles.calloutContent}>
              <strong>Absolute Zero-Liability for Data Leaks & Server Accidents:</strong>
              <br />TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL SREE AI, ITS FOUNDERS, OPERATORS, DIRECTORS, AFFILIATES, AGENTS, OR EMPLOYEES BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
              <br />• DATA BREACHES, DATA LEAKS, UNAUTHORIZED DATABASE ACCESS, OR ACCIDENTAL SERVER LOSS ARISING FROM THIRD-PARTY CLOUD VULNERABILITIES (SUPABASE, CLOUDFLARE, OR RAZORPAY);
              <br />• ERRORS, INACCURACIES, COPYRIGHT INFRINGEMENTS, OR HALLUCINATIONS PRODUCED BY UNDERLYING AI MODELS (NVIDIA, GOOGLE, GROQ, DEEPGRAM);
              <br />• THIRD-PARTY API CHARGES, BILLING OVERAGES, OR KEY REVOCATIONS INCURRED ON YOUR PERSONAL BYOK ACCOUNTS;
              <br />• BUSINESS INTERRUPTION, LOSS OF PROFITS, GOODWILL, WORK STOPPAGE, OR SYSTEM CRASHES.
            </div>
          </div>
        </li>
        <li>
          <strong>Aggregate Liability Cap:</strong>
          If, notwithstanding the foregoing, liability is imposed upon Sree AI by a court of competent jurisdiction, our total aggregate liability for all claims shall be strictly capped at the lesser of (A) the total subscription fees actually paid by you to Sree AI in the three (3) months immediately preceding the event, or (B) ₹1,000 INR (One Thousand Indian Rupees).
        </li>
      </ol>

      <hr />

      <h2>11. Indemnification</h2>
      <p>
        <strong>YOU AGREE TO DEFEND, INDEMNIFY, AND HOLD HARMLESS SREE AI, ITS FOUNDERS, OPERATORS, DIRECTORS, EMPLOYEES, AND AGENTS FROM AND AGAINST ANY AND ALL CLAIMS, DEMANDS, LIABILITIES, DAMAGES, LOSSES, COSTS, AND EXPENSES (INCLUDING REASONABLE LEGAL FEES) ARISING OUT OF OR IN ANY WAY CONNECTED WITH:</strong>
      </p>
      <ol>
        <li>Your User Content, uploaded documents, audio recordings, or media files;</li>
        <li>Your use or misuse of AI outputs in professional, legal, medical, or financial contexts;</li>
        <li>Your violation of these Terms or any applicable statutory regulation (including the Indian DPDP Act 2023, IT Act 2000, GDPR, or CCPA);</li>
        <li>Any claim that your User Content or prompts infringed upon the copyright, privacy, or trade secret rights of a third party.</li>
      </ol>

      <hr />

      <h2>12. Governing Law & Dispute Resolution</h2>
      <h3>12.1 Governing Law</h3>
      <p>These Terms shall be governed by, interpreted, and construed in accordance with the laws of the <strong>Republic of India</strong>, without regard to its conflict of law principles.</p>

      <h3>12.2 Dispute Resolution & Arbitration</h3>
      <p>Any dispute, controversy, or claim arising out of or relating to this contract, including the formation or breach thereof, shall be settled by binding arbitration in accordance with the <strong>Arbitration and Conciliation Act, 1996</strong> (India).</p>
      <ul>
        <li><strong>Arbitration Venue:</strong> Bhubaneswar / Bengaluru, India.</li>
        <li><strong>Language:</strong> English.</li>
        <li><strong>Arbitrator:</strong> A sole arbitrator mutually appointed by the parties.</li>
        <li>The arbitral award shall be final and binding upon both parties.</li>
      </ul>

      <hr />

      <h2>13. Changes to These Terms</h2>
      <p>We reserve the right to revise and update these Terms at our discretion. We will notify you of any material changes by updating the "Last Updated" date and posting a notice within the web application. Your continued use of Sree AI after any modifications constitutes your acceptance of the updated Terms.</p>

      <hr />

      <h2>14. Grievance Redressal & Statutory Contact</h2>
      <p>For legal inquiries, dispute notifications, or statutory grievances under the <strong>Digital Personal Data Protection Act, 2023</strong> or <strong>IT Act, 2000</strong>, please contact:</p>
      <ul>
        <li><strong>Grievance Desk:</strong> Legal Compliance Department, Sree AI</li>
        <li><strong>Email:</strong> <a href="mailto:legal@sreeai.qzz.io">legal@sreeai.qzz.io</a> / <a href="mailto:privacy@sreeai.qzz.io">privacy@sreeai.qzz.io</a></li>
        <li><strong>Support & Ticket Portal:</strong> <a href="/feature-request">https://app.sreeai.qzz.io/feature-request</a></li>
        <li><strong>Official Website:</strong> <a href="https://sreeai.qzz.io" target="_blank" rel="noreferrer">https://sreeai.qzz.io</a></li>
      </ul>
    </LegalLayout>
  );
};
