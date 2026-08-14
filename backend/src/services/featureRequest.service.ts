import axios from 'axios';
import { supabaseAdmin } from '../lib/supabase';

export const FEATURE_REQUEST_WEBHOOK_URL = process.env.FEATURE_REQUEST_WEBHOOK_URL;
export const FEATURE_REQUEST_WEBHOOK_SECRET = process.env.FEATURE_REQUEST_WEBHOOK_SECRET;

if (!FEATURE_REQUEST_WEBHOOK_URL) {
  console.warn('[FeatureRequest] FEATURE_REQUEST_WEBHOOK_URL not set — webhook delivery will be skipped.');
}
if (!FEATURE_REQUEST_WEBHOOK_SECRET) {
  console.warn('[FeatureRequest] FEATURE_REQUEST_WEBHOOK_SECRET not set — webhook delivery will be skipped.');
}

export type FeatureStatus = 'Raised' | 'In Progress' | 'Resolved' | 'Rejected';

export interface CreateFeatureRequestInput {
  title: string;
  category: string;
  categoryLabel?: string;
  priority: 'nice_to_have' | 'helpful' | 'high_impact' | 'critical';
  description: string;
  useCase?: string;
  referenceUrl?: string;
  userId?: string;
  anonId?: string;
  userName?: string;
  userEmail?: string;
  userPlan?: string;
  notifyOnUpdate?: boolean;
  clientMetadata?: Record<string, any>;
}

export interface FeatureRequestRecord {
  id: string;
  ticket_id: string;
  user_id: string | null;
  anon_id: string | null;
  title: string;
  category: string;
  category_label: string | null;
  priority: string;
  description: string;
  use_case: string | null;
  reference_url: string | null;
  user_name: string | null;
  user_email: string | null;
  user_plan: string;
  status: FeatureStatus;
  admin_notes: string | null;
  notify_on_update: boolean;
  client_metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export class FeatureRequestService {
  /**
   * Generates a unique human-friendly ticket ID (e.g. SREE-REQ-8F29A)
   */
  private static generateTicketId(): string {
    const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `SREE-REQ-${randomSuffix}`;
  }

  /**
   * Create a new feature request, store it in Supabase, and deliver to n8n webhook
   */
  static async create(input: CreateFeatureRequestInput): Promise<{
    request: FeatureRequestRecord;
    webhookDelivered: boolean;
    ticketId: string;
  }> {
    const ticketId = this.generateTicketId();
    const now = new Date().toISOString();

    const insertPayload = {
      ticket_id: ticketId,
      user_id: input.userId || null,
      anon_id: input.anonId || null,
      title: input.title.trim(),
      category: input.category,
      category_label: input.categoryLabel || input.category,
      priority: input.priority,
      description: input.description.trim(),
      use_case: input.useCase?.trim() || null,
      reference_url: input.referenceUrl?.trim() || null,
      user_name: input.userName?.trim() || 'Guest Explorer',
      user_email: input.userEmail?.trim() || 'guest@sree.ai',
      user_plan: input.userPlan || 'free',
      status: 'Raised' as FeatureStatus,
      notify_on_update: input.notifyOnUpdate ?? true,
      client_metadata: input.clientMetadata || {},
      created_at: now,
      updated_at: now,
    };

    // 1. Insert into Supabase table
    let savedRecord: FeatureRequestRecord = {
      id: ticketId,
      ...insertPayload,
      admin_notes: null,
    };

    try {
      const { data, error } = await supabaseAdmin
        .from('feature_requests')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error('[FeatureRequest] Supabase insert warning/error:', error.message);
      } else if (data) {
        savedRecord = data as FeatureRequestRecord;
      }
    } catch (dbErr: any) {
      console.error('[FeatureRequest] DB save error:', dbErr.message);
    }

    // 2. Deliver to n8n webhook with secret authentication (skip if not configured)
    let webhookDelivered = false;
    if (!FEATURE_REQUEST_WEBHOOK_URL || !FEATURE_REQUEST_WEBHOOK_SECRET) {
      console.info('[FeatureRequest] Webhook not configured — skipping delivery (record saved to DB).');
    } else {
      try {
        const n8nPayload = {
          request_type: "FeatureRequest",
          source: "SREE_APP_feature-request_form",
          event: 'feature_request_submitted',
          ticket_id: ticketId,
          id: savedRecord.id,
          timestamp: now,
          secret: FEATURE_REQUEST_WEBHOOK_SECRET,
          webhook_secret: FEATURE_REQUEST_WEBHOOK_SECRET,
          feature: {
            title: insertPayload.title,
            category: insertPayload.category,
            category_label: insertPayload.category_label,
            priority: insertPayload.priority,
            description: insertPayload.description,
            use_case: insertPayload.use_case,
            reference_url: insertPayload.reference_url,
            status: 'Raised',
          },
          user: {
            id: insertPayload.user_id || insertPayload.anon_id || 'anonymous',
            email: insertPayload.user_email,
            name: insertPayload.user_name,
            plan: insertPayload.user_plan,
            is_authenticated: !!insertPayload.user_id,
            notify_on_update: insertPayload.notify_on_update,
          },
          client_metadata: insertPayload.client_metadata,
        };

        await axios.post(FEATURE_REQUEST_WEBHOOK_URL, n8nPayload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': FEATURE_REQUEST_WEBHOOK_SECRET,
            Authorization: `Bearer ${FEATURE_REQUEST_WEBHOOK_SECRET}`,
          },
          timeout: 10000,
        });

        webhookDelivered = true;
      } catch (webhookErr: any) {
        console.warn(
          '[FeatureRequest] n8n Webhook notification result:',
          webhookErr.response?.status,
          webhookErr.message
        );
        // Even if n8n test webhook is offline / awaiting canvas trigger, we do not throw because request was recorded in DB
      }
    } // end of webhook-configured else block

    return {
      request: savedRecord,
      webhookDelivered,
      ticketId,
    };
  }

  /**
   * Get all requests created by a specific authenticated user or anonymous identity
   */
  static async getUserRequests(
    userId?: string,
    anonId?: string
  ): Promise<FeatureRequestRecord[]> {
    if (!userId && !anonId) {
      return [];
    }

    try {
      let query = supabaseAdmin
        .from('feature_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      } else if (anonId) {
        query = query.eq('anon_id', anonId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[FeatureRequest] Error fetching user requests:', error.message);
        return [];
      }

      return (data || []) as FeatureRequestRecord[];
    } catch (err: any) {
      console.error('[FeatureRequest] DB query error:', err.message);
      return [];
    }
  }

  /**
   * Get public roadmap requests
   */
  static async getPublicRoadmap(limit = 50): Promise<Partial<FeatureRequestRecord>[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('feature_requests')
        .select('id, ticket_id, title, category, category_label, priority, status, admin_notes, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[FeatureRequest] Error fetching public roadmap:', error.message);
        return [];
      }

      return (data || []) as Partial<FeatureRequestRecord>[];
    } catch (err: any) {
      console.error('[FeatureRequest] DB public query error:', err.message);
      return [];
    }
  }

  /**
   * Update the status and admin notes for a feature request
   */
  static async updateStatus(
    ticketId: string,
    status: FeatureStatus,
    adminNotes?: string
  ): Promise<FeatureRequestRecord | null> {
    const validStatuses: FeatureStatus[] = ['Raised', 'In Progress', 'Resolved', 'Rejected'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (adminNotes !== undefined) {
        updateData.admin_notes = adminNotes;
      }

      const { data, error } = await supabaseAdmin
        .from('feature_requests')
        .update(updateData)
        .eq('ticket_id', ticketId)
        .select()
        .single();

      if (error) {
        console.error('[FeatureRequest] Error updating status:', error.message);
        throw new Error(error.message);
      }

      return data as FeatureRequestRecord;
    } catch (err: any) {
      console.error('[FeatureRequest] DB status update error:', err.message);
      throw err;
    }
  }
}
