import React from 'react';
import { LegalLayout } from './LegalLayout';

export const CookiePolicyPage: React.FC = () => {
  return (
    <LegalLayout
      title="Cookie Policy"
      subtitle="Transparency regarding essential authentication tokens, functional preferences, and privacy controls on Sree AI."
      badge="Cookie & Storage Transparency"
      lastUpdated="August 20, 2026"
    >
      <h2>1. What Are Cookies and Local Storage?</h2>
      <p>
        Cookies and browser local storage are small text files or key-value pairs stored on your device when you visit our website. They allow Sree AI to authenticate your session, maintain rate-limiting quotas, and remember your visual interface preferences.
      </p>

      <hr />

      <h2>2. Categories of Cookies We Use</h2>
      <p>Sree AI adheres to a privacy-first data philosophy. We do <strong>NOT</strong> use invasive cross-site advertising cookies or sell tracking data.</p>

      <h3>2.1 Strictly Necessary Storage (Essential)</h3>
      <table>
        <thead>
          <tr>
            <th>Key / Token</th>
            <th>Provider</th>
            <th>Type</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>sb-access-token</code></td>
            <td>Supabase Auth</td>
            <td>Cookie / Storage</td>
            <td>Secure JWT authenticating your active user session.</td>
          </tr>
          <tr>
            <td><code>sb-refresh-token</code></td>
            <td>Supabase Auth</td>
            <td>Cookie / Storage</td>
            <td>Enables silent token renewal without re-login.</td>
          </tr>
          <tr>
            <td><code>sree_anon_id</code></td>
            <td>Sree AI</td>
            <td>Cookie / Storage</td>
            <td>Anonymous guest identifier for trial quotas.</td>
          </tr>
          <tr>
            <td><code>sree_tos_consent</code></td>
            <td>Sree AI</td>
            <td>LocalStorage</td>
            <td>Proof of user acceptance of Terms & Privacy Policy.</td>
          </tr>
          <tr>
            <td><code>sree_file_agreement</code></td>
            <td>Sree AI</td>
            <td>LocalStorage</td>
            <td>Consent for file processing & upload disclaimer.</td>
          </tr>
        </tbody>
      </table>

      <h3>2.2 Functional Preferences</h3>
      <ul>
        <li><code>sree_theme</code>: Remembers your interface theme (Dark Mode / Light Mode).</li>
        <li><code>sree_sidebar_collapsed</code>: Remembers whether the navigation sidebar is collapsed.</li>
        <li><code>sree_selected_model</code>: Remembers your preferred default AI model for chat sessions.</li>
      </ul>

      <hr />

      <h2>3. How to Manage Cookies</h2>
      <p>
        You can block or delete cookies through your browser settings. However, disabling essential tokens (<code>sb-access-token</code>, <code>sree_anon_id</code>) will prevent you from signing in, accessing paid plans, or persisting chat sessions.
      </p>

      <hr />

      <h2>4. Privacy Inquiries</h2>
      <p>
        For cookie questions, contact our privacy desk at <a href="mailto:privacy@sreeai.qzz.io">privacy@sreeai.qzz.io</a>.
      </p>
    </LegalLayout>
  );
};
