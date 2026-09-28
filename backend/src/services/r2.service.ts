import { S3Client, PutObjectCommand, DeleteObjectsCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabase';

class R2Service {
  private s3Client: S3Client;
  private bucketName: string;
  private publicUrl: string;

  constructor() {
    this.bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'chat-files';
    this.publicUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL || '').split('#')[0]?.trim() ?? '';
    
    const s3Config: any = {
      region: 'auto',
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true, // Crucial for S3-compatible providers like R2
    };

    if (process.env.CLOUDFLARE_R2_ENDPOINT) {
      s3Config.endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
    } else {
      console.warn('WARNING: CLOUDFLARE_R2_ENDPOINT is not set. Storage will default to AWS S3.');
    }

    this.s3Client = new S3Client(s3Config);
  }

  /**
   * Compute SHA-256 hash of a file using streaming (no full buffer in memory).
   * Safe for large files (up to 250MB pro tier).
   */
  async computeFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Resolve the public URL for a given bucket.
   */
  private resolvePublicUrl(bucket: string): string {
    if (bucket === 'image-generation') return process.env.IMAGE_GENERATION_PUBLIC_URL || '';
    if (bucket === 'video-generations') return process.env.VIDEO_GENERATION_PUBLIC_URL || '';
    if (bucket === 'feature-request' || bucket === process.env.FEATURE_REQUEST_R2_BUCKET_NAME) {
      return process.env.FEATURE_REQUEST_R2_PUBLIC_URL || 'https://frss.sreeai.qzz.io';
    }
    return this.publicUrl;
  }

  async uploadFile(filePath: string, originalName: string, mimeType: string, bucket?: string): Promise<string> {
    const fileExtension = path.extname(originalName);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}${fileExtension}`;
    const fileBuffer = await fs.readFile(filePath);

    const command = new PutObjectCommand({
      Bucket: bucket || this.bucketName,
      Key: fileName,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    try {
      await this.s3Client.send(command);
      
      const targetBucket = bucket || this.bucketName;
      const bucketPublicUrl = this.resolvePublicUrl(targetBucket);

      if (bucketPublicUrl) {
        return `${bucketPublicUrl.replace(/\/$/, '')}/${fileName}`;
      }
      
      return fileName; 
    } catch (error: any) {
      console.error('R2 Upload Error:', error);
      throw new Error(error?.message || 'Failed to upload file to storage');
    }
  }

  /**
   * Upload a file with content-hash deduplication.
   * 
   * Flow:
   * 1. Compute SHA-256 of the file
   * 2. Check `file_uploads` table for an existing entry with same hash + bucket
   * 3. If found → return existing URL (no R2 upload), increment ref_count
   * 4. If not found → upload to R2, record in `file_uploads`
   * 
   * @returns { url, deduplicated } — `deduplicated: true` means the file already existed
   */
  async uploadFileDeduped(
    filePath: string,
    originalName: string,
    mimeType: string,
    userId?: string,
    bucket?: string,
    abortSignal?: AbortSignal
  ): Promise<{ url: string; deduplicated: boolean }> {
    const targetBucket = bucket || this.bucketName;

    // 1. Compute content hash (streaming, memory-safe)
    const contentHash = await this.computeFileHash(filePath);
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;

    // Check if aborted before proceeding
    if (abortSignal?.aborted) throw new Error('Upload aborted');

    // 2. Look up existing file by hash + bucket
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('file_uploads')
      .select('id, r2_url, ref_count')
      .eq('content_hash', contentHash)
      .eq('bucket', targetBucket)
      .maybeSingle();

    if (lookupError) {
      console.error('[R2 Dedup] Lookup error:', lookupError.message);
      // Fall through to normal upload if lookup fails
    }

    if (existing) {
      // 3a. File already exists — update ref_count and last_used_at
      await supabaseAdmin
        .from('file_uploads')
        .update({
          ref_count: existing.ref_count + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      console.log(`[R2 Dedup] Reused existing file: ${existing.r2_url} (ref_count: ${existing.ref_count + 1})`);
      return { url: existing.r2_url, deduplicated: true };
    }

    // Check abort again before expensive upload
    if (abortSignal?.aborted) throw new Error('Upload aborted');

    // 3b. New file — upload to R2
    const url = await this.uploadFile(filePath, originalName, mimeType, bucket);

    // 4. Record in file_uploads table
    const r2Key = url.split('/').pop() || '';
    const { error: insertError } = await supabaseAdmin.from('file_uploads').insert({
      content_hash: contentHash,
      r2_key: r2Key,
      r2_url: url,
      bucket: targetBucket,
      original_name: originalName,
      mime_type: mimeType,
      file_size_bytes: fileSize,
      user_id: userId || null,
    });

    if (insertError) {
      // Race condition: another concurrent upload of the same file inserted first
      if (insertError.code === '23505') { // Unique violation
        console.log('[R2 Dedup] Concurrent insert race — fetching existing record');
        const { data: raced } = await supabaseAdmin
          .from('file_uploads')
          .select('r2_url')
          .eq('content_hash', contentHash)
          .eq('bucket', targetBucket)
          .single();

        if (raced) {
          // Clean up the duplicate we just uploaded
          try {
            await this.deleteObjects([r2Key], targetBucket);
          } catch (e) {
            console.warn('[R2 Dedup] Failed to clean up duplicate R2 object:', e);
          }
          return { url: raced.r2_url, deduplicated: true };
        }
      }
      // Non-critical: file uploaded successfully but record not saved — log and return
      console.error('[R2 Dedup] Insert error (file still uploaded):', insertError.message);
    }

    return { url, deduplicated: false };
  }

  async uploadBase64(base64Data: string, mimeType: string, bucket?: string): Promise<string> {
    // Remove data:image/png;base64, if present
    const base64String = base64Data.includes(',') ? (base64Data.split(',')[1] ?? '') : base64Data;
    const buffer = Buffer.from(base64String, 'base64');
    
    const extension = mimeType.split('/')[1] || 'png';
    const fileName = `generated-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${extension}`;
    
    const command = new PutObjectCommand({
      Bucket: bucket || this.bucketName,
      Key: fileName,
      Body: buffer,
      ContentType: mimeType,
    });

    try {
      await this.s3Client.send(command);
      
      const targetBucket = bucket || this.bucketName;
      const bucketPublicUrl = this.resolvePublicUrl(targetBucket);

      if (bucketPublicUrl) {
        return `${bucketPublicUrl.replace(/\/$/, '')}/${fileName}`;
      }
      
      return fileName;
    } catch (error) {
      console.error('R2 Base64 Upload Error:', error);
      throw new Error('Failed to upload base64 to storage');
    }
  }

  // Optional: Generate a signed URL for temporary access if bucket is private
  async getSignedUrl(key: string, expiresIn: number = 3600, bucket?: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket || this.bucketName,
      Key: key,
    });
    return getSignedUrl(this.s3Client, (command as any), { expiresIn });
  }

  /**
   * Batch-delete objects from R2. Max 1000 keys per call (S3 API limit).
   * Used for cleanup of expired user data.
   */
  async deleteObjects(keys: string[], bucket?: string): Promise<number> {
    if (!keys.length) return 0;
    const targetBucket = bucket || this.bucketName;
    let totalDeleted = 0;

    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      try {
        await this.s3Client.send(new DeleteObjectsCommand({
          Bucket: targetBucket,
          Delete: {
            Objects: batch.map(key => ({ Key: key })),
            Quiet: true,
          },
        }));
        totalDeleted += batch.length;
      } catch (error) {
        console.error(`R2 Batch Delete Error (bucket: ${targetBucket}):`, error);
      }
    }
    return totalDeleted;
  }

  /**
   * Decrement ref_count for a list of R2 URLs.
   * 
   * Called when messages/conversations containing attachments are deleted.
   * Uses GREATEST(0, ref_count - 1) to prevent negative counts.
   * 
   * @returns Number of records updated
   */
  async decrementRefByUrls(urls: string[]): Promise<number> {
    if (!urls.length) return 0;

    let updated = 0;

    // Process in batches of 50 to avoid oversized queries
    for (let i = 0; i < urls.length; i += 50) {
      const batch = urls.slice(i, i + 50);

      // Use raw SQL via RPC for the atomic GREATEST(0, ref_count - 1) update
      // since supabase-js doesn't support column arithmetic in .update()
      const { data, error } = await supabaseAdmin.rpc('decrement_file_ref_counts', {
        p_urls: batch,
      });

      if (error) {
        console.error('[R2 Dedup] Failed to decrement ref_count:', error.message);
        // Fallback: update one-by-one
        for (const url of batch) {
          const { data: record } = await supabaseAdmin
            .from('file_uploads')
            .select('id, ref_count')
            .eq('r2_url', url)
            .maybeSingle();

          if (record) {
            await supabaseAdmin
              .from('file_uploads')
              .update({
                ref_count: Math.max(0, record.ref_count - 1),
                last_used_at: new Date().toISOString(),
              })
              .eq('id', record.id);
            updated++;
          }
        }
      } else {
        updated += data || batch.length;
      }
    }

    if (updated > 0) {
      console.log(`[R2 Dedup] Decremented ref_count for ${updated} file(s)`);
    }
    return updated;
  }

  /**
   * Extract all attachment URLs from messages in a conversation.
   * 
   * Reads messages.metadata.attachments[].url for all messages
   * in the given conversation. Used before deleting a conversation
   * to know which file_uploads records to decrement.
   */
  async extractAttachmentUrlsFromConversation(conversationId: string): Promise<string[]> {
    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select('metadata')
      .eq('conversation_id', conversationId)
      .not('metadata', 'is', null);

    if (error || !messages) {
      console.error('[R2 Dedup] Failed to fetch messages for ref cleanup:', error?.message);
      return [];
    }

    const urls: string[] = [];
    for (const msg of messages) {
      const attachments = msg.metadata?.attachments;
      if (Array.isArray(attachments)) {
        for (const att of attachments) {
          if (att.url && typeof att.url === 'string') {
            urls.push(att.url);
          }
        }
      }
    }

    return urls;
  }

  /**
   * Extract attachment URLs from multiple conversations at once.
   * Used during account deletion.
   */
  async extractAttachmentUrlsFromConversations(conversationIds: string[]): Promise<string[]> {
    if (!conversationIds.length) return [];

    const urls: string[] = [];

    // Process in batches of 50 conversation IDs
    for (let i = 0; i < conversationIds.length; i += 50) {
      const batch = conversationIds.slice(i, i + 50);
      const { data: messages, error } = await supabaseAdmin
        .from('messages')
        .select('metadata')
        .in('conversation_id', batch)
        .not('metadata', 'is', null);

      if (error || !messages) {
        console.error('[R2 Dedup] Batch fetch error:', error?.message);
        continue;
      }

      for (const msg of messages) {
        const attachments = msg.metadata?.attachments;
        if (Array.isArray(attachments)) {
          for (const att of attachments) {
            if (att.url && typeof att.url === 'string') {
              urls.push(att.url);
            }
          }
        }
      }
    }

    return urls;
  }

  /**
   * Check if an object exists in R2.
   * Uses HeadObject (zero-bandwidth, just metadata).
   */
  async objectExists(key: string, bucket?: string): Promise<boolean> {
    try {
      await this.s3Client.send(new HeadObjectCommand({
        Bucket: bucket || this.bucketName,
        Key: key,
      }));
      return true;
    } catch (error: any) {
      if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
        return false;
      }
      // Unknown error — treat as "might exist" to avoid false deletes
      console.warn(`[R2 Health] HeadObject error for ${key}:`, error.message);
      return true;
    }
  }

  /**
   * R2 ↔ Database Health Checker
   * 
   * Verifies that every record in `file_uploads` actually has a corresponding
   * object in R2. Stale records (where the R2 object is missing) are flagged
   * or cleaned up.
   * 
   * How it works:
   * 1. Fetch all records from `file_uploads` (paginated, 100 at a time)
   * 2. For each record, call HeadObject on R2 to verify the object exists
   * 3. If the object is MISSING from R2:
   *    - Option A (dryRun=true):  Log it and add to the report
   *    - Option B (dryRun=false): Delete the stale DB record so future
   *                                uploads of the same content go through normally
   * 4. Return a full report: { checked, healthy, stale, errors, staleRecords }
   * 
   * Use cases:
   * - Periodic cron job (e.g. weekly) to keep the dedup table honest
   * - Manual audit before/after bucket migrations
   * - Debug when a user reports "file not found" on a URL that should exist
   * 
   * Performance:
   * - HeadObject is cheap (no data transfer, just a metadata check)
   * - Paginated to avoid loading the entire table at once
   * - Concurrency-limited to 5 parallel HeadObject calls to avoid rate-limiting
   */
  async healthCheck(options?: {
    dryRun?: boolean;
    bucket?: string;
    limit?: number;
  }): Promise<{
    checked: number;
    healthy: number;
    stale: number;
    errors: number;
    staleRecords: Array<{ id: string; r2_key: string; r2_url: string; content_hash: string }>;
    cleanedUp: number;
  }> {
    const { dryRun = true, bucket, limit = 1000 } = options || {};
    const targetBucket = bucket || this.bucketName;
    
    const report = {
      checked: 0,
      healthy: 0,
      stale: 0,
      errors: 0,
      staleRecords: [] as Array<{ id: string; r2_key: string; r2_url: string; content_hash: string }>,
      cleanedUp: 0,
    };

    console.log(`[R2 Health] Starting health check (dryRun: ${dryRun}, bucket: ${targetBucket}, limit: ${limit})`);

    // Paginated fetch from file_uploads
    let offset = 0;
    const pageSize = 100;

    while (report.checked < limit) {
      const { data: records, error } = await supabaseAdmin
        .from('file_uploads')
        .select('id, r2_key, r2_url, content_hash')
        .eq('bucket', targetBucket)
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('[R2 Health] DB fetch error:', error.message);
        break;
      }

      if (!records || records.length === 0) break;

      // Check objects in batches of 5 concurrent HeadObject calls
      for (let i = 0; i < records.length && report.checked < limit; i += 5) {
        const batch = records.slice(i, Math.min(i + 5, records.length));
        const results = await Promise.allSettled(
          batch.map(async (record) => {
            const exists = await this.objectExists(record.r2_key, targetBucket);
            return { record, exists };
          })
        );

        for (const result of results) {
          report.checked++;

          if (result.status === 'rejected') {
            report.errors++;
            continue;
          }

          const { record, exists } = result.value;

          if (exists) {
            report.healthy++;
          } else {
            report.stale++;
            report.staleRecords.push({
              id: record.id,
              r2_key: record.r2_key,
              r2_url: record.r2_url,
              content_hash: record.content_hash,
            });
          }
        }
      }

      offset += pageSize;
    }

    // Clean up stale records if not a dry run
    if (!dryRun && report.staleRecords.length > 0) {
      const staleIds = report.staleRecords.map(r => r.id);

      // Delete in batches of 50
      for (let i = 0; i < staleIds.length; i += 50) {
        const batch = staleIds.slice(i, i + 50);
        const { error: deleteError } = await supabaseAdmin
          .from('file_uploads')
          .delete()
          .in('id', batch);

        if (deleteError) {
          console.error('[R2 Health] Failed to clean up stale records:', deleteError.message);
        } else {
          report.cleanedUp += batch.length;
        }
      }
    }

    console.log(`[R2 Health] Complete — checked: ${report.checked}, healthy: ${report.healthy}, stale: ${report.stale}, errors: ${report.errors}, cleaned: ${report.cleanedUp}`);
    return report;
  }

  /**
   * Garbage-collect orphaned files: records with ref_count = 0 and
   * last_used_at older than the given threshold.
   * 
   * 1. Query file_uploads for orphans
   * 2. Delete their R2 objects
   * 3. Delete the DB records
   */
  async garbageCollect(options?: {
    daysOld?: number;
    bucket?: string;
    dryRun?: boolean;
    limit?: number;
  }): Promise<{
    found: number;
    deletedFromR2: number;
    deletedFromDB: number;
  }> {
    const { daysOld = 30, bucket, dryRun = true, limit = 500 } = options || {};
    const targetBucket = bucket || this.bucketName;
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

    console.log(`[R2 GC] Starting garbage collection (dryRun: ${dryRun}, daysOld: ${daysOld}, bucket: ${targetBucket})`);

    const { data: orphans, error } = await supabaseAdmin
      .from('file_uploads')
      .select('id, r2_key')
      .eq('bucket', targetBucket)
      .lte('ref_count', 0)
      .lt('last_used_at', cutoff)
      .limit(limit);

    if (error || !orphans) {
      console.error('[R2 GC] Query error:', error?.message);
      return { found: 0, deletedFromR2: 0, deletedFromDB: 0 };
    }

    const report = { found: orphans.length, deletedFromR2: 0, deletedFromDB: 0 };

    if (dryRun || orphans.length === 0) {
      console.log(`[R2 GC] Found ${orphans.length} orphans (dry run — no deletions)`);
      return report;
    }

    // Delete R2 objects
    const keys = orphans.map(o => o.r2_key);
    report.deletedFromR2 = await this.deleteObjects(keys, targetBucket);

    // Delete DB records
    const ids = orphans.map(o => o.id);
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const { error: delError } = await supabaseAdmin
        .from('file_uploads')
        .delete()
        .in('id', batch);
      if (!delError) report.deletedFromDB += batch.length;
    }

    console.log(`[R2 GC] Complete — found: ${report.found}, deletedFromR2: ${report.deletedFromR2}, deletedFromDB: ${report.deletedFromDB}`);
    return report;
  }
}

export const r2Service = new R2Service();

// ─── Periodic R2 Maintenance Cron ────────────────────────────────────────────

const HEALTH_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Every 24 hours
const GC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;       // Every 7 days
const GC_DAYS_OLD = 30;                                 // GC orphans older than 30 days

let healthCheckIntervalHandle: ReturnType<typeof setInterval> | null = null;
let gcIntervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic R2 maintenance cron.
 * 
 * Two jobs run on separate intervals:
 * 
 * 1. **Health Check (every 24h)** — Scans `file_uploads` table and verifies
 *    each record has a real R2 object via HeadObject. Stale records (where R2
 *    object was manually deleted or lost) are auto-cleaned so future uploads
 *    of the same content go through normally instead of returning a dead URL.
 *    Runs with `dryRun: false` so stale DB records are actually removed.
 * 
 * 2. **Garbage Collection (every 7 days)** — Finds records with `ref_count = 0`
 *    that haven't been used in 30+ days (nobody references them anymore).
 *    Deletes both the R2 object AND the DB record to free storage.
 *    Runs with `dryRun: false`.
 * 
 * Should be called once at server startup.
 */
export function startR2MaintenanceCron(): void {
  if (healthCheckIntervalHandle || gcIntervalHandle) {
    console.warn('[R2 Maintenance] Cron already running — skipping duplicate start');
    return;
  }

  console.log(
    `[R2 Maintenance] ✅ Started | health check: every 24h | GC: every 7d (orphans > ${GC_DAYS_OLD}d)`
  );

  // ── Health Check Cron ──
  healthCheckIntervalHandle = setInterval(async () => {
    try {
      console.log('[R2 Maintenance] 🔍 Running scheduled health check...');
      const report = await r2Service.healthCheck({ dryRun: false });
      console.log(
        `[R2 Maintenance] 🔍 Health check done — ` +
        `checked: ${report.checked}, healthy: ${report.healthy}, ` +
        `stale: ${report.stale}, cleaned: ${report.cleanedUp}`
      );
    } catch (err: any) {
      console.error('[R2 Maintenance] Health check failed:', err.message);
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  // ── Garbage Collection Cron ──
  gcIntervalHandle = setInterval(async () => {
    try {
      console.log('[R2 Maintenance] 🗑️ Running scheduled garbage collection...');
      const report = await r2Service.garbageCollect({
        dryRun: false,
        daysOld: GC_DAYS_OLD,
      });
      console.log(
        `[R2 Maintenance] 🗑️ GC done — ` +
        `found: ${report.found}, deletedFromR2: ${report.deletedFromR2}, ` +
        `deletedFromDB: ${report.deletedFromDB}`
      );
    } catch (err: any) {
      console.error('[R2 Maintenance] Garbage collection failed:', err.message);
    }
  }, GC_INTERVAL_MS);
}

/**
 * Stop the R2 maintenance cron. Called during graceful shutdown.
 */
export function stopR2MaintenanceCron(): void {
  if (healthCheckIntervalHandle) {
    clearInterval(healthCheckIntervalHandle);
    healthCheckIntervalHandle = null;
  }
  if (gcIntervalHandle) {
    clearInterval(gcIntervalHandle);
    gcIntervalHandle = null;
  }
  console.log('[R2 Maintenance] Cron stopped');
}
