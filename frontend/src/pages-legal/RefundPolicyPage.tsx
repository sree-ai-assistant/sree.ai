import React from 'react';
import { LegalLayout } from './LegalLayout';
import { Receipt, CheckCircle, AlertCircle, Clock, CreditCard, ShieldCheck } from 'lucide-react';
import styles from './LegalLayout.module.css';

export const RefundPolicyPage: React.FC = () => {
  return (
    <LegalLayout
      title="Refund and Cancellation Policy"
      subtitle="Terms and conditions governing subscription cancellations, recurring billing cycles, refund eligibility, and Razorpay dispute resolution."
      badge="Billing & Cancellation"
      lastUpdated="August 20, 2026"
    >
      <div className={styles.callout}>
        <Receipt className={styles.calloutIcon} size={20} />
        <div className={styles.calloutContent}>
          <strong>Digital Consumable Service:</strong>
          Sree AI provisions immediate GPU compute time, LLM inference tokens, and cloud bandwidth upon request. Subscriptions may be cancelled at any time with zero cancellation penalty.
        </div>
      </div>

      <h2>1. Overview</h2>
      <p>
        At <strong>Sree AI</strong>, we strive to deliver an exceptional AI experience with reliable multi-model conversational chat, voice processing, and image/video generation. This Refund and Cancellation Policy outlines the terms and conditions governing subscription cancellations, recurring billing cycles, refund eligibility, and billing disputes processed through our authorized payment partner, <strong>Razorpay</strong>.
      </p>
      <p>
        By purchasing a subscription to Sree AI (Starter Plan or Pro Plan), you acknowledge and agree to the terms set forth in this Policy.
      </p>

      <hr />

      <h2>2. Subscription Plans & Recurring Billing</h2>
      <ol>
        <li><strong>Billing Cadence:</strong> Subscriptions are billed in advance on a recurring monthly or annual basis depending on the plan selected during checkout.</li>
        <li><strong>Automatic Renewal:</strong> Your subscription will automatically renew at the beginning of each billing cycle unless you cancel before the current cycle ends.</li>
        <li><strong>Payment Processor:</strong> All payments and recurring debits are processed securely in Indian Rupees (INR) via Razorpay.</li>
      </ol>

      <hr />

      <h2>3. Cancellation Policy</h2>
      <h3>3.1 How to Cancel</h3>
      <p>You may cancel your subscription at any time with zero cancellation fees through either of the following methods:</p>
      <ul>
        <li><strong>In-App Self-Service:</strong> Navigate to <strong>Settings</strong> $\rightarrow$ <strong>Billing & Subscription</strong> $\rightarrow$ Click <strong>"Cancel Subscription"</strong>.</li>
        <li><strong>Customer Support:</strong> Contact our billing team at <a href="mailto:support@sreeai.qzz.io">support@sreeai.qzz.io</a> with your registered account email and subscription details.</li>
      </ul>

      <h3>3.2 Effective Cancellation Date</h3>
      <ul>
        <li>When you cancel, your cancellation is marked to take effect at the conclusion of your current active billing period (<code>cancel_at_cycle_end = true</code>).</li>
        <li><strong>You will retain full access</strong> to all paid tier features, increased rate limits, and model access until your current billing cycle expires (<code>billing_cycle_end</code>).</li>
        <li>After the billing cycle ends, your account will automatically downgrade to the <strong>Free Plan</strong> with standard rate limits. Your historical chats, custom instructions, and account data will remain intact.</li>
      </ul>

      <hr />

      <h2>4. Refund Policy</h2>
      <h3>4.1 Digital Service Nature</h3>
      <p>
        Sree AI provides digital, consumable AI services that incur immediate computing and infrastructure costs (GPU compute time, LLM inference tokens, and cloud bandwidth) upon utilization. Therefore:
      </p>
      <ul>
        <li><strong>Standard Subscription Payments are Non-Refundable:</strong> Once a monthly or annual subscription payment is successfully captured by Razorpay, the payment is generally non-refundable for the elapsed or active billing cycle.</li>
      </ul>

      <h3>4.2 Exceptions & Refund Eligibility</h3>
      <p>We will consider refund requests on a case-by-case basis under the following exceptional circumstances:</p>
      
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Eligibility</th>
              <th>Action / Resolution</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Duplicate or Erroneous Transactions</strong></td>
              <td>100% Eligible</td>
              <td>If you were charged multiple times for the same subscription period due to a payment gateway timeout or glitch, the duplicate charge(s) will be refunded in full.</td>
            </tr>
            <tr>
              <td><strong>Major Technical Outages</strong></td>
              <td>Pro-rata Credit / Refund</td>
              <td>If a prolonged, severe service disruption attributable entirely to Sree AI prevents you from utilizing the platform for more than seventy-two (72) consecutive hours.</td>
            </tr>
            <tr>
              <td><strong>Unauthorized Fraudulent Charges</strong></td>
              <td>100% Eligible</td>
              <td>If an unauthorized charge was made on your card or payment instrument, verified upon immediate notification and proof.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>4.3 Ineligible for Refund</h3>
      <p>Refunds will <strong>NOT</strong> be issued in the following scenarios:</p>
      <ul>
        <li>You forgot to cancel your subscription before the automatic renewal date.</li>
        <li>Dissatisfaction with standard probabilistic AI model outputs, hallucinations, or creative quality.</li>
        <li>Suspension or termination of your account resulting from a violation of our <a href="/terms">Terms of Service</a> or <a href="/acceptable-use">Acceptable Use Policy</a>.</li>
        <li>Third-party API charges incurred directly through user-provided Bring Your Own Key (BYOK) configurations.</li>
      </ul>

      <hr />

      <h2>5. Refund Processing Timeline</h2>
      <p>If a refund request is approved by our billing team:</p>
      <ol>
        <li><strong>Initiation:</strong> The refund will be initiated through the Razorpay payment gateway within <strong>2 to 3 business days</strong> of approval.</li>
        <li><strong>Credit to Account:</strong> Depending on your bank, card issuer, or UPI payment provider, the refunded amount will reflect in your original payment method within <strong>5 to 7 business days</strong>.</li>
        <li><strong>Confirmation:</strong> You will receive an automated email confirmation from Razorpay and Sree AI containing your Refund Reference ID (<code>rfnd_xxx</code>).</li>
      </ol>

      <hr />

      <h2>6. Chargebacks and Payment Disputes</h2>
      <p>
        We encourage users to reach out directly to our support team to resolve billing questions or duplicate charges before initiating a chargeback or payment dispute with their bank. Unjustified chargebacks may result in immediate suspension of account privileges pending investigation.
      </p>

      <hr />

      <h2>7. Contact Billing Support</h2>
      <p>For cancellation assistance, billing inquiries, or refund requests, please contact our billing team:</p>
      <ul>
        <li><strong>Billing Support Email:</strong> <a href="mailto:billing@sreeai.qzz.io">billing@sreeai.qzz.io</a> / <a href="mailto:support@sreeai.qzz.io">support@sreeai.qzz.io</a></li>
        <li><strong>Support & Ticket Portal:</strong> <a href="/feature-request">https://app.sreeai.qzz.io/feature-request</a></li>
        <li><strong>Response Time:</strong> We aim to respond to all billing inquiries within <strong>24 business hours</strong>.</li>
      </ul>
    </LegalLayout>
  );
};
