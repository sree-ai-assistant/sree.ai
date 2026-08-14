/**
 * PostHog Analytics & Error Tracking Service
 * 
 * Server-side PostHog client for capturing backend exceptions,
 * custom events, and user identification.
 * 
 * Usage:
 *   import { posthog } from './posthog.service';
 *   posthog.captureException(error, userId, { source: 'ai_chat' });
 */
import { PostHog } from 'posthog-node';

const POSTHOG_TOKEN = process.env.POSTHOG_PROJECT_TOKEN;
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

// Only initialize if the token is configured (safe for dev/CI environments)
export const posthog: PostHog | null = POSTHOG_TOKEN
    ? new PostHog(POSTHOG_TOKEN, {
        host: POSTHOG_HOST,
        // Automatically capture uncaught exceptions and unhandled rejections
        enableExceptionAutocapture: true,
    })
    : null;

if (!POSTHOG_TOKEN) {
    console.warn('[PostHog] POSTHOG_PROJECT_TOKEN not set — analytics disabled');
}

/**
 * Graceful shutdown — flushes pending events before process exits.
 * Call this in your server shutdown hook if needed.
 */
export async function shutdownPostHog(): Promise<void> {
    if (posthog) {
        await posthog.shutdown();
    }
}
