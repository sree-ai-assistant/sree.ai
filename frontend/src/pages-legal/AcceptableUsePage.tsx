import React from 'react';
import { LegalLayout } from './LegalLayout';

export const AcceptableUsePage: React.FC = () => {
  return (
    <LegalLayout
      title="Acceptable Use Policy (AUP)"
      subtitle="Behavioral standards, safety guidelines, and prohibited activities across the Sree AI computing environment."
      badge="Safety & Compliance"
      lastUpdated="August 20, 2026"
    >
      <h2>1. Purpose & Scope</h2>
      <p>
        This Acceptable Use Policy ("AUP") defines the behavioral standards governing all users accessing Sree AI as authenticated subscribers or anonymous guest visitors. Our goal is to foster a safe, creative, and productive AI computing environment.
      </p>

      <hr />

      <h2>2. Prohibited Activities</h2>
      <h3>2.1 Illegal & Harmful Content</h3>
      <ul>
        <li><strong>Child Sexual Abuse Material (CSAM):</strong> Absolute zero-tolerance policy. Immediate account ban and statutory referral to law enforcement agencies (NCMEC/Cyber Crime).</li>
        <li><strong>Suicide & Self-Harm:</strong> Content encouraging, providing instructions for, or glorifying self-harm or eating disorders.</li>
        <li><strong>Terrorism & Hate Speech:</strong> Content inciting violence, terrorism, or discrimination against protected groups.</li>
        <li><strong>Non-Consensual Deepfakes:</strong> Generating non-consensual explicit imagery or deceptive impersonations of real individuals.</li>
      </ul>

      <h3>2.2 Cybersecurity Threats & Malicious Code</h3>
      <ul>
        <li><strong>Malware Development:</strong> Generating viruses, ransomware, keyloggers, exploits, or attack scripts.</li>
        <li><strong>Phishing:</strong> Generating deceptive credential-harvesting pages or financial scam scripts.</li>
        <li><strong>Attacking Infrastructure:</strong> Unauthorized stress testing, penetration testing, or DDoS attacks against Sree AI servers.</li>
      </ul>

      <h3>2.3 Platform Abuse & Rate Limit Circumvention</h3>
      <ul>
        <li><strong>Rate Limit Bypassing:</strong> Using botnets, multi-account farming, or rotating IP proxies to bypass quotas.</li>
        <li><strong>Stolen API Keys:</strong> Injecting compromised or unauthorized keys into the BYOK vault.</li>
        <li><strong>Scraping:</strong> Automated harvesting of platform conversations, model outputs, or internal configurations.</li>
      </ul>

      <hr />

      <h2>3. High-Risk Automated Decision Making</h2>
      <p>Sree AI outputs must <strong>NOT</strong> be used as the certified basis for high-risk decisions impacting human life or legal standing:</p>
      <ul>
        <li>Providing certified medical diagnosis, triage, or pharmaceutical prescriptions.</li>
        <li>Providing certified legal counsel, courtroom filings, or formal regulatory compliance certifications.</li>
        <li>Automated determinations regarding employment hiring, creditworthiness, loan approvals, or housing eligibility.</li>
      </ul>

      <hr />

      <h2>4. Enforcement & Reporting Violations</h2>
      <p>
        Violations may result in formal warnings, stricter rate limits, immediate account termination without refund, or law enforcement referral.
      </p>
      <p>To report violations, contact our Trust & Safety team at <a href="mailto:abuse@sreeai.qzz.io">abuse@sreeai.qzz.io</a>.</p>
    </LegalLayout>
  );
};
