import React from 'react';
import { LegalLayout } from './LegalLayout';
import { Shield, Info, Lock, CheckCircle2 } from 'lucide-react';
import styles from './LegalLayout.module.css';

export const CookiePolicyPage: React.FC = () => {
  return (
    <LegalLayout
      title="Cookie Policy"
      subtitle="Transparency regarding strictly necessary tokens, privacy-preserving PostHog diagnostics, and interface preferences on Sree AI."
      badge="Cookie & Storage Transparency"
      lastUpdated="August 20, 2026"
    >
      <div className={styles.callout}>
        <Shield className={styles.calloutIcon} size={20} />
        <div className={styles.calloutContent}>
          <strong>Privacy-First Storage Policy:</strong>
          Sree AI adheres to a privacy-first data philosophy. We do <strong>NOT</strong> use invasive cross-site advertising cookies or sell tracking data to data brokers. All storage mechanisms are strictly operational, functional, or diagnostic.
        </div>
      </div>

      <h2>1. What Are Cookies and Local Storage?</h2>
      <p>
        Cookies and browser local storage are small text files or key-value data structures stored locally on your device (computer, tablet, or mobile phone) when you visit our website. They allow the platform to remember your active session, authenticate requests, enforce rate limits, and maintain your user interface preferences.
      </p>

      <hr />

      <h2>2. Categories of Cookies & Storage We Use</h2>

      <h3>2.1 Strictly Necessary Cookies & Storage (Essential)</h3>
      <p>These tokens and identifiers are required for core platform functionality, user authentication, and rate limiting:</p>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Key / Cookie Name</th>
              <th>Provider</th>
              <th>Storage Type</th>
              <th>Expiration</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>sb-access-token</code></td>
              <td>Supabase Auth</td>
              <td>Cookie / LocalStorage</td>
              <td>1 Hour</td>
              <td>Secure JWT token authenticating your active user session.</td>
            </tr>
            <tr>
              <td><code>sb-refresh-token</code></td>
              <td>Supabase Auth</td>
              <td>Cookie / LocalStorage</td>
              <td>Rolling</td>
              <td>Enables silent token renewal without requiring re-login.</td>
            </tr>
            <tr>
              <td><code>sree_anon_id</code></td>
              <td>Sree AI</td>
              <td>Cookie / LocalStorage</td>
              <td>90 Days</td>
              <td>Anonymous visitor identifier enabling guest chat & trial quotas.</td>
            </tr>
            <tr>
              <td><code>sree_tos_consent</code></td>
              <td>Sree AI</td>
              <td>LocalStorage</td>
              <td>1 Year</td>
              <td>Stores proof of user acceptance of Terms & Privacy Policy.</td>
            </tr>
            <tr>
              <td><code>sree_file_agreement</code></td>
              <td>Sree AI</td>
              <td>LocalStorage</td>
              <td>1 Year</td>
              <td>Stores consent for file processing & upload disclaimer.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>2.2 Analytics & Diagnostics Storage (PostHog)</h3>
      <p>
        We utilize <strong>PostHog Inc.</strong> for privacy-conscious application performance monitoring, UI latency tracking, and error diagnostics:
      </p>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Key / Cookie Name</th>
              <th>Provider</th>
              <th>Storage Type</th>
              <th>Expiration</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>ph_&lt;project_token&gt;_posthog</code></td>
              <td>PostHog</td>
              <td>Cookie / LocalStorage</td>
              <td>1 Year</td>
              <td>Stores anonymous session telemetry, active feature flags, and UI interaction timestamps without PII.</td>
            </tr>
            <tr>
              <td><code>ph_distinct_id</code></td>
              <td>PostHog</td>
              <td>Cookie / LocalStorage</td>
              <td>1 Year</td>
              <td>Unique random UUID to deduplicate client crash reports and measure page load performance.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={styles.callout}>
        <Info className={styles.calloutIcon} size={20} />
        <div className={styles.calloutContent}>
          <strong>PostHog Privacy Guarantee:</strong> Sree AI's telemetry integration is configured to strip cleartext IP addresses, personal identifiers, chat message bodies, and uploaded file contents. Telemetry is utilized solely for platform reliability and speed optimization.
        </div>
      </div>

      <h3>2.3 Functional & Preference Storage</h3>
      <p>These preferences ensure a seamless and personalized user experience across page reloads:</p>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Key / Cookie Name</th>
              <th>Provider</th>
              <th>Storage Type</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>sree_theme</code></td>
              <td>Sree AI</td>
              <td>LocalStorage</td>
              <td>Remembers your interface theme (Dark Mode / Light Mode).</td>
            </tr>
            <tr>
              <td><code>sree_sidebar_collapsed</code></td>
              <td>Sree AI</td>
              <td>LocalStorage</td>
              <td>Remembers whether your navigation sidebar is open or minimized.</td>
            </tr>
            <tr>
              <td><code>sree_selected_model</code></td>
              <td>Sree AI</td>
              <td>LocalStorage</td>
              <td>Remembers your preferred default AI model for chat sessions.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr />

      <h2>3. How to Manage and Control Cookies</h2>
      <ol>
        <li><strong>Browser Controls:</strong> You can block, disable, or delete cookies directly through your browser settings (Chrome, Safari, Firefox, Edge, Brave).</li>
        <li>
          <strong>Impact of Disabling Cookies:</strong> Because our cookies are strictly functional and security-oriented, blocking essential cookies (<code>sb-access-token</code>, <code>sree_anon_id</code>) will prevent you from signing in, persisting chat conversations, or accessing paid subscription tiers.
        </li>
      </ol>

      <hr />

      <h2>4. Contact Information</h2>
      <p>If you have questions regarding our use of cookies or local storage, please contact:</p>
      <ul>
        <li><strong>Privacy Desk:</strong> <a href="mailto:privacy@sreeai.qzz.io">privacy@sreeai.qzz.io</a></li>
        <li><strong>Official Website:</strong> <a href="https://sreeai.qzz.io" target="_blank" rel="noreferrer">https://sreeai.qzz.io</a></li>
      </ul>
    </LegalLayout>
  );
};
