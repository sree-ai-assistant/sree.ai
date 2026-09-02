import React from 'react';
import { LegalLayout } from './LegalLayout';

export const RefundPolicyPage: React.FC = () => {
  return (
    <LegalLayout
      title="Refund & Cancellation Policy"
      subtitle="Terms and conditions governing subscription cancellations, recurring billing cycles, and refund dispute resolution."
      badge="Billing Policy"
      lastUpdated="August 20, 2026"
    >
      <h2>1. Overview</h2>
      <p>
        At <strong>Sree AI</strong>, we strive to deliver an exceptional AI experience with reliable multi-model conversational chat, voice processing, and image/video generation. This Refund and Cancellation Policy outlines the terms governing subscription cancellations, recurring billing cycles, refund eligibility, and billing disputes processed through our authorized payment partner, <strong>Razorpay</strong>.
      </p>

      <hr />

      <h2>2. Subscription Plans & Recurring Billing</h2>
      <ul>
        <li><strong>Billing Cadence:</strong> Subscriptions are billed in advance on a recurring monthly or annual basis.</li>
        <li><strong>Automatic Renewal:</strong> Subscriptions automatically renew at the beginning of each billing cycle unless cancelled before the current cycle ends.</li>
        <li><strong>Payment Processor:</strong> All payments and recurring debits are processed securely in Indian Rupees (INR) via Razorpay.</li>
      </ul>

      <hr />

      <h2>3. Cancellation Policy</h2>
      <h3>3.1 How to Cancel</h3>
      <p>You may cancel your subscription at any time with zero cancellation fees:</p>
      <ul>
        <li><strong>In-App Self-Service:</strong> Navigate to <strong>Settings</strong> $\rightarrow$ <strong>Billing & Subscription</strong> $\rightarrow$ Click <strong>"Cancel Subscription"</strong>.</li>
        <li><strong>Customer Support:</strong> Email our billing team at <a href="mailto:billing@sreeai.qzz.io">billing@sreeai.qzz.io</a>.</li>
      </ul>

      <h3>3.2 Effective Cancellation Date</h3>
      <ul>
        <li>Cancellation takes effect at the conclusion of your current active billing period (<code>cancel_at_cycle_end = true</code>).</li>
        <li><strong>You retain full access</strong> to all paid tier features, increased rate limits, and model access until your current billing cycle expires (<code>billing_cycle_end</code>).</li>
        <li>After expiration, your account gracefully downgrades to the <strong>Free Plan</strong> with your chat history preserved.</li>
      </ul>

      <hr />

      <h2>4. Refund Policy</h2>
      <h3>4.1 Consumable Digital Service</h3>
      <p>
        Sree AI provides digital, consumable AI services that incur immediate computing and infrastructure costs (GPU compute time, LLM inference tokens, and cloud bandwidth) upon utilization. Therefore, <strong>standard subscription payments are non-refundable once successfully captured</strong>.
      </p>

      <h3>4.2 Exceptions & Refund Eligibility</h3>
      <p>Refunds are considered on a case-by-case basis under the following circumstances:</p>
      <ol>
        <li><strong>Duplicate Transactions:</strong> Multiple charges for the same subscription period due to a gateway timeout will be refunded in full.</li>
        <li><strong>Major Technical Outages:</strong> Severe platform disruptions attributable entirely to Sree AI exceeding seventy-two (72) consecutive hours.</li>
        <li><strong>Fraudulent Transactions:</strong> Verified unauthorized charges on your payment instrument.</li>
      </ol>

      <hr />

      <h2>5. Refund Processing Timeline</h2>
      <ul>
        <li><strong>Initiation:</strong> Processed through Razorpay within <strong>2 to 3 business days</strong> of approval.</li>
        <li><strong>Credit to Account:</strong> Reflects in your original payment method (Bank/UPI/Card) within <strong>5 to 7 business days</strong>.</li>
        <li><strong>Reference ID:</strong> You will receive an automated confirmation containing your Razorpay Refund ID (<code>rfnd_xxx</code>).</li>
      </ul>

      <hr />

      <h2>6. Billing Support & Contact</h2>
      <p>For cancellation assistance or billing questions:</p>
      <ul>
        <li><strong>Billing Support:</strong> <a href="mailto:billing@sreeai.qzz.io">billing@sreeai.qzz.io</a> / <a href="mailto:support@sreeai.qzz.io">support@sreeai.qzz.io</a></li>
        <li><strong>Support & Ticket Portal:</strong> <a href="/feature-request">Submit a Billing Ticket</a></li>
        <li><strong>Response Time:</strong> We aim to respond within <strong>24 business hours</strong>.</li>
      </ul>
    </LegalLayout>
  );
};
