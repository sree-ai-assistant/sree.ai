import React from 'react';
import { LegalLayout } from './LegalLayout';
import { AlertTriangle, ShieldAlert, Ban, FileWarning, CheckCircle2 } from 'lucide-react';
import styles from './LegalLayout.module.css';

export const AcceptableUsePage: React.FC = () => {
  return (
    <LegalLayout
      title="Acceptable Use Policy (AUP)"
      subtitle="Behavioral standards, safety guidelines, and prohibited computing activities across the Sree AI ecosystem."
      badge="Safety & Compliance"
      lastUpdated="August 20, 2026"
    >
      <div className={`${styles.callout} ${styles.calloutDanger}`}>
        <ShieldAlert className={styles.calloutIcon} size={20} />
        <div className={styles.calloutContent}>
          <strong>Zero Tolerance Policy:</strong>
          Sree AI enforces an absolute zero-tolerance policy against child sexual abuse material (CSAM), non-consensual deepfakes, automated botnet attacks, and malware generation. Violators face immediate permanent termination and referral to law enforcement.
        </div>
      </div>

      <h2>1. Purpose & Scope</h2>
      <p>
        This Acceptable Use Policy ("AUP") defines the rules and behavioral standards governing all users, whether accessing Sree AI as authenticated subscribers or anonymous guest visitors.
      </p>
      <p>
        Our goal is to foster a creative, productive, and safe AI computing environment while protecting our infrastructure, AI provider ecosystems, and community from abuse, harm, and illegal exploitation.
      </p>

      <hr />

      <h2>2. Prohibited Activities</h2>
      <p>You agree not to use Sree AI, its chat completions, voice synthesis, image/video studio, or APIs for any of the following prohibited purposes:</p>

      <h3>2.1 Illegal, Dangerous & Harmful Content</h3>
      <ul>
        <li><strong>Child Sexual Abuse & Exploitation (CSAM):</strong> Generating, requesting, uploading, or distributing any material depicting the sexual abuse or exploitation of minors. We maintain a zero-tolerance policy and immediately report instances to the National Center for Missing & Exploited Children (NCMEC) and relevant law enforcement agencies.</li>
        <li><strong>Suicide & Self-Harm:</strong> Generating content that encourages, provides instructions for, or glorifies suicide, self-mutilation, or eating disorders.</li>
        <li><strong>Terrorism & Violent Extremism:</strong> Promoting, organizing, or facilitating violent extremism, terrorist acts, or illegal weapons manufacturing.</li>
        <li><strong>Hate Speech & Harassment:</strong> Generating content that attacks, dehumanizes, harasses, threatens, or incites hatred against individuals or groups based on race, ethnicity, religion, disability, age, nationality, sexual orientation, or gender identity.</li>
        <li><strong>Non-Consensual Sexual Content & Deepfakes:</strong> Using image or video generation tools to create sexually explicit imagery, deepfakes, or non-consensual depictions of real individuals.</li>
      </ul>

      <h3>2.2 Cybersecurity Threats & Malicious Computing</h3>
      <ul>
        <li><strong>Malware & Exploit Development:</strong> Creating computer viruses, ransomware, keyloggers, rootkits, zero-day exploits, or automated attack scripts.</li>
        <li><strong>Phishing & Social Engineering:</strong> Generating deceptive phishing lures, credential-harvesting pages, scam scripts, or fraudulent financial schemes.</li>
        <li><strong>System Attacking & Stress Testing:</strong> Conducting unauthorized penetration testing, vulnerability scanning, or Denial of Service (DoS/DDoS) attacks against Sree AI servers or databases.</li>
      </ul>

      <h3>2.3 Platform Abuse & Circumvention</h3>
      <ul>
        <li><strong>Rate Limit Bypassing:</strong> Using automated scripts, multiple dummy accounts, or rotating IP proxies to bypass platform tier rate limits, token quotas, or anonymous trial boundaries.</li>
        <li><strong>API Key Abuse:</strong> Attempting to inject stolen, unauthorized, or compromised third-party API keys into the Bring Your Own Key (BYOK) system.</li>
        <li><strong>Unauthorized Scraping:</strong> Using scrapers, automated spiders, or extraction bots to harvest conversation data, model outputs, or proprietary system configurations without written authorization.</li>
      </ul>

      <hr />

      <h2>3. High-Risk Automated Decision Making</h2>
      <p>Sree AI is an AI assistant designed for productivity and creative exploration. You must <strong>NOT</strong> use Sree AI outputs as the sole or certified basis for high-risk decisions that impact human life, legal standing, or financial health, including:</p>
      <ul>
        <li>Providing certified medical diagnosis, emergency triage, or pharmaceutical prescriptions.</li>
        <li>Providing certified legal counsel, courtroom filings, or formal regulatory compliance certifications.</li>
        <li>Making automated determinations regarding employment hiring, creditworthiness, loan approvals, or housing eligibility.</li>
      </ul>

      <hr />

      <h2>4. Enforcement & Content Moderation</h2>
      <ol>
        <li><strong>Automated Detection:</strong> Requests are monitored by automated heuristic filters and abuse detection middlewares (<code>abuse_flags</code>) for anomalous traffic patterns and prohibited prompt signatures.</li>
        <li><strong>Account Actions:</strong> If a user is found to violate this AUP, Sree AI reserves the right to:
          <ul>
            <li>Issue formal warnings or temporary request cooldowns.</li>
            <li>Enforce stricter rate-limiting thresholds.</li>
            <li>Immediately suspend or permanently terminate account access without refund.</li>
            <li>Refer serious illegal activities to relevant statutory authorities.</li>
          </ul>
        </li>
      </ol>

      <hr />

      <h2>5. Reporting Violations</h2>
      <p>If you encounter content or activity on Sree AI that violates this Acceptable Use Policy, please report it immediately to our Trust & Safety team:</p>
      <ul>
        <li><strong>Abuse Reporting Email:</strong> <a href="mailto:abuse@sreeai.qzz.io">abuse@sreeai.qzz.io</a> / <a href="mailto:security@sreeai.qzz.io">security@sreeai.qzz.io</a></li>
        <li><strong>Ticket Portal:</strong> <a href="/feature-request">https://app.sreeai.qzz.io/feature-request</a></li>
      </ul>
    </LegalLayout>
  );
};
