import React from 'react';
import { LegalLayout } from './LegalLayout';

export const TermsPage: React.FC = () => {
  return (
    <LegalLayout
      title="Terms of Service"
      subtitle="The binding legal agreement governing your access, usage, subscriptions, and AI capabilities on Sree AI."
      badge="Terms of Service"
      lastUpdated="August 20, 2026"
    >
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
      <p>Subscriptions are billed in advance on a recurring monthly or annual basis via our authorized payment gateway, <strong>Razorpay</strong>. By subscribing to a paid tier, you authorize Razorpay to automatically charge your designated payment method at each recurring billing cycle start until you explicitly cancel.</p>

      <h3>3.3 Upgrades, Downgrades & Deferred Switches</h3>
      <ul>
        <li><strong>Instant Upgrades:</strong> Upgrading to a higher tier triggers an immediate checkout session. Upon payment confirmation via webhook, new plan quotas and capabilities are unlocked immediately.</li>
        <li><strong>Deferred Downgrades / Switches:</strong> If you choose to switch to a lower plan tier, the downgrade is scheduled to take effect at the conclusion of your current active billing cycle (<code>upcoming_tier</code> / <code>upcoming_start_date</code>), ensuring you retain full access to the features you paid for.</li>
        <li><strong>Plan Rollback on Payment Failure:</strong> If a recurring renewal or deferred subscription payment fails after automated retries, the system will gracefully transition your account to the Free tier while preserving your historical chat data.</li>
      </ul>

      <h3>3.4 Cancellation Policy</h3>
      <p>You may cancel your subscription at any time via the <strong>Billing & Subscription</strong> section in your account settings. Cancellation takes effect at the end of the current paid billing period (<code>cancel_at_cycle_end = true</code>). No further charges will occur, and you will maintain paid tier access until the cycle expires.</p>

      <hr />

      <h2>4. Bring Your Own Key (BYOK) Terms</h2>
      <p>Sree AI allows users to provide their own third-party API keys (e.g., NVIDIA NIM, Google Gemini, Groq, Deepgram) to unlock enhanced quotas and a <strong>0.2x usage multiplier</strong>:</p>
      <ul>
        <li><strong>Direct Third-Party Billing:</strong> When utilizing BYOK, you are directly responsible for all third-party API fees, token costs, and rate limits incurred on your personal provider accounts.</li>
        <li><strong>Key Security & Encryption:</strong> We encrypt your API keys using <strong>AES-256-GCM</strong> before database storage. Keys are decrypted transiently strictly to route your specific inference requests.</li>
        <li><strong>No Key Sharing:</strong> You warrant that any API key you submit is legitimately owned by you and does not violate the terms of service of the respective provider.</li>
        <li><strong>Revocation:</strong> You may delete or update your BYOK keys at any time through the Settings page.</li>
      </ul>

      <hr />

      <h2>5. Intellectual Property & AI-Generated Content</h2>
      <h3>5.1 Your Input & Content</h3>
      <p>You retain all ownership rights in the prompts, text, images, audio recordings, documents, and data you submit to the Services ("User Content"). You grant Sree AI a worldwide, non-exclusive, royalty-free license to host, process, and transmit your User Content solely to the extent necessary to deliver the Services to you.</p>

      <h3>5.2 AI Output Ownership & Licensing</h3>
      <p>To the maximum extent permitted by applicable intellectual property law, you own all outputs (text responses, generated images, synthesized speech, generated videos) generated in response to your prompts ("Output Content"). You are free to use your Output Content for personal, academic, or commercial purposes.</p>

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
      </ol>

      <hr />

      <h2>7. Service Availability, Modifications & Rate Limiting</h2>
      <p>We strive for continuous availability but do not guarantee uninterrupted, error-free, or zero-downtime operation. All users are subject to rate limiting enforced per minute, day, and billing month via atomic database RPCs. Exceeding limits will return HTTP <code>429 Too Many Requests</code>.</p>

      <hr />

      <h2>8. Disclaimer of Warranties & Absolute Assumption of Risk</h2>
      <blockquote>
        <strong>"AS-IS" AND "AS-AVAILABLE" PROVISION:</strong><br />
        THE SERVICES ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, TIMELINESS, OR CONTINUOUS AVAILABILITY.
      </blockquote>
      <p><strong>Third-Party Infrastructure & AI Model Dependency:</strong></p>
      <ul>
        <li><strong>Database & Authentication Hosting:</strong> Hosted on cloud infrastructure managed by <strong>Supabase Inc.</strong> Any database outage, unauthorized intrusion, data loss, or server corruption occurring at the database level is subject exclusively to Supabase's service availability terms and infrastructure security.</li>
        <li><strong>AI Model Execution & Inference:</strong> Executed via third-party enterprise APIs operated by <strong>NVIDIA Corporation</strong>, <strong>Google LLC / Alphabet</strong>, <strong>Groq LLC</strong>, and <strong>Deepgram Inc.</strong> Sree AI does not control or guarantee the internal model logic, training datasets, or factual accuracy of third-party model outputs.</li>
      </ul>
      <p><strong>User-Uploaded Files, Media, Documents & AI Provider Transmission:</strong></p>
      <ul>
        <li>You acknowledge that uploading files (PDFs, Word documents, spreadsheets, images, audio) and connecting third-party API keys (BYOK) carries inherent internet and third-party processing risks.</li>
        <li>When you upload documents or images during chat, they are transmitted to external AI model providers (Google LLC, NVIDIA Corporation, Groq LLC, Deepgram Inc.) to execute inference, vision analysis, or parsing. Upstream providers handle and process data in accordance with their respective terms of service and developer policies.</li>
        <li><strong>YOU BEAR 100% SOLE RESPONSIBILITY AND LIABILITY FOR ALL CONTENT UPLOADED TO SREE AI.</strong></li>
        <li>Sree AI shall have zero liability for how third-party AI providers process, cache, inspect for safety, or retain uploaded data, or if confidential, proprietary, or sensitive data uploaded by you is subjected to accidental exposure or third-party intercept.</li>
      </ul>

      <hr />

      <h2>9. Limitation of Liability & Intermediary Safe Harbor (IT Act Section 79)</h2>
      <p><strong>Intermediary Status (India IT Act 2000):</strong> Sree AI operates as an <strong>Intermediary</strong> under <strong>Section 79 of the Information Technology Act, 2000</strong> and the <strong>IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021</strong>. Sree AI does not initiate the transmission, select the receiver of the transmission, or modify the information contained in AI user transmissions. Sree AI is entitled to the full protections of statutory safe harbor for all third-party and user-generated content.</p>
      <blockquote>
        <strong>ABSOLUTE ZERO-LIABILITY FOR DATA LEAKS & ACCIDENTS:</strong><br />
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL SREE AI, ITS FOUNDERS, OPERATORS, DIRECTORS, AFFILIATES, AGENTS, OR EMPLOYEES BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO DATA BREACHES, DATA LEAKS, UNAUTHORIZED DATABASE ACCESS, OR ACCIDENTAL SERVER LOSS ARISING FROM THIRD-PARTY CLOUD VULNERABILITIES (SUPABASE, CLOUDFLARE, RAZORPAY, OR AI MODEL PROVIDERS).
      </blockquote>
      <p><strong>Aggregate Liability Cap:</strong> Total aggregate liability for all claims shall be strictly capped at the lesser of (A) the total subscription fees actually paid by you to Sree AI in the three (3) months immediately preceding the event, or (B) ₹1,000 INR (One Thousand Indian Rupees).</p>

      <hr />

      <h2>10. Indemnification</h2>
      <p>
        <strong>YOU AGREE TO DEFEND, INDEMNIFY, AND HOLD HARMLESS SREE AI, ITS FOUNDERS, OPERATORS, DIRECTORS, EMPLOYEES, AND AGENTS FROM AND AGAINST ANY AND ALL CLAIMS, DEMANDS, LIABILITIES, DAMAGES, LOSSES, COSTS, AND EXPENSES (INCLUDING REASONABLE LEGAL FEES) ARISING OUT OF OR IN ANY WAY CONNECTED WITH YOUR USER CONTENT, UPLOADED DOCUMENTS, AUDIO RECORDINGS, MISUSE OF AI OUTPUTS, OR VIOLATION OF THESE TERMS.</strong>
      </p>

      <hr />

      <h2>11. Governing Law & Arbitration</h2>
      <p>These Terms shall be governed by the laws of the <strong>Republic of India</strong>. Any dispute, controversy, or claim arising out of or relating to this contract shall be settled by binding arbitration in accordance with the <strong>Arbitration and Conciliation Act, 1996</strong> (India) in <strong>Bhubaneswar / Bengaluru, India</strong> in the English language.</p>

      <hr />

      <h2>12. Grievance Redressal & Statutory Contact</h2>
      <p>For statutory grievances under the <strong>Digital Personal Data Protection Act, 2023</strong> or <strong>IT Act, 2000</strong>:</p>
      <ul>
        <li><strong>Grievance Desk:</strong> Legal Compliance Department, Sree AI</li>
        <li><strong>Email:</strong> <a href="mailto:legal@sreeai.qzz.io">legal@sreeai.qzz.io</a> / <a href="mailto:privacy@sreeai.qzz.io">privacy@sreeai.qzz.io</a></li>
        <li><strong>Support & Ticket Portal:</strong> <a href="/feature-request">Submit a Ticket</a></li>
      </ul>
    </LegalLayout>
  );
};
