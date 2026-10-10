import fs from 'fs';
import path from 'path';

/**
 * Temporary uploads cleanup service.
 * 
 * Safely purges stale temporary files left behind in `uploads/` (and subdirectories)
 * due to client disconnections, canceled uploads, or server restarts during processing.
 * 
 * Safety invariants:
 * 1. Only removes files older than `maxAgeMs` (default: 30 minutes) to never touch active in-flight uploads.
 * 2. Never deletes directories (`avatars`, `frames`, `screenshots`).
 * 3. Never deletes Git markers (`nothing.txt`, `.gitkeep`, `.gitignore`, or any `.*` file).
 * 4. Gracefully handles Windows file locks (`EBUSY` / `EPERM`) without crashing.
 */

export const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
export const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const DEFAULT_INITIAL_DELAY_MS = 5000; // 5 seconds after server startup

const PROTECTED_FILENAMES = new Set([
  'nothing.txt',
  '.gitkeep',
  '.gitignore',
]);

const TARGET_SUBDIRECTORIES = ['', 'frames', 'avatars', 'screenshots'];

let cleanupIntervalHandle: NodeJS.Timeout | null = null;
let startupTimeoutHandle: NodeJS.Timeout | null = null;

export interface CleanupResult {
  scanned: number;
  deleted: number;
  bytesFreed: number;
  errors: number;
  deletedFiles?: string[];
}

export interface CleanTempOptions {
  maxAgeMs?: number | undefined;
  uploadsDir?: string | undefined;
}

export interface StartCleanupCronOptions {
  intervalMs?: number | undefined;
  initialDelayMs?: number | undefined;
  maxAgeMs?: number | undefined;
  uploadsDir?: string | undefined;
}

function resolveUploadsDir(customDir?: string | undefined): string {
  if (customDir) return customDir;
  const localUploads = path.join(process.cwd(), 'uploads');
  if (fs.existsSync(localUploads)) return localUploads;
  const nestedUploads = path.join(process.cwd(), 'backend', 'uploads');
  if (fs.existsSync(nestedUploads)) return nestedUploads;
  return localUploads;
}

/**
 * Scans uploads directories and removes files older than `maxAgeMs`.
 */
export async function cleanTempUploads(options?: CleanTempOptions): Promise<CleanupResult> {
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const uploadsDir = resolveUploadsDir(options?.uploadsDir);

  const result: CleanupResult = {
    scanned: 0,
    deleted: 0,
    bytesFreed: 0,
    errors: 0,
    deletedFiles: [],
  };

  if (!fs.existsSync(uploadsDir)) {
    return result;
  }

  const now = Date.now();

  for (const subDir of TARGET_SUBDIRECTORIES) {
    const dirPath = subDir ? path.join(uploadsDir, subDir) : uploadsDir;

    if (!fs.existsSync(dirPath)) {
      continue;
    }

    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dirPath);
    } catch (err: any) {
      console.warn(`[TempCleanup] Unable to read directory ${dirPath}:`, err.message);
      result.errors++;
      continue;
    }

    for (const entry of entries) {
      // 1. Skip protected files and dotfiles
      if (entry.startsWith('.') || PROTECTED_FILENAMES.has(entry.toLowerCase())) {
        continue;
      }

      const filePath = path.join(dirPath, entry);

      try {
        const stat = fs.statSync(filePath);

        // 2. Never delete subdirectories
        if (stat.isDirectory()) {
          continue;
        }

        result.scanned++;

        // 3. Only delete files that are older than maxAgeMs
        const ageMs = now - stat.mtimeMs;
        if (ageMs >= maxAgeMs) {
          const fileSize = stat.size;
          const relativeName = subDir ? `${subDir}/${entry}` : entry;
          fs.unlinkSync(filePath);
          result.deleted++;
          result.bytesFreed += fileSize;
          result.deletedFiles?.push(relativeName);
          console.log(`[TempCleanup] 🗑️ Deleted stale file: ${relativeName} (${(fileSize / 1024).toFixed(1)} KB)`);
        }
      } catch (err: any) {
        // Handle race conditions or file locks (e.g. EBUSY on Windows)
        if (err.code !== 'ENOENT') {
          console.debug(`[TempCleanup] Skipped file ${entry} (${err.code || err.message})`);
          result.errors++;
        }
      }
    }
  }

  if (result.deleted > 0) {
    const kbFreed = (result.bytesFreed / 1024).toFixed(1);
    const filesList = result.deletedFiles && result.deletedFiles.length <= 5
      ? `: ${result.deletedFiles.join(', ')}`
      : `: ${result.deletedFiles?.slice(0, 5).join(', ')}... (+${result.deletedFiles!.length - 5} more)`;
    console.log(
      `[TempCleanup] 🧹 Purged ${result.deleted} stale file(s)${filesList} (${kbFreed} KB freed).`
    );
  }

  return result;
}

/**
 * Starts the periodic cleanup background cron.
 */
export function startTempCleanupCron(options?: StartCleanupCronOptions): void {
  if (cleanupIntervalHandle || startupTimeoutHandle) {
    console.warn('[TempCleanup] Cron already running — skipping duplicate start');
    return;
  }

  const intervalMs = options?.intervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
  const initialDelayMs = options?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const uploadsDir = options?.uploadsDir;

  const cleanupOpts: CleanTempOptions = { maxAgeMs };
  if (uploadsDir) {
    cleanupOpts.uploadsDir = uploadsDir;
  }

  console.log(
    `[TempCleanup] ✅ Started | interval: ${Math.round(intervalMs / 60000)}m | threshold: ${Math.round(maxAgeMs / 60000)}m`
  );

  // 1. Startup pass after a brief initial delay
  startupTimeoutHandle = setTimeout(async () => {
    try {
      await cleanTempUploads(cleanupOpts);
    } catch (err: any) {
      console.error('[TempCleanup] Startup cleanup pass failed:', err.message);
    }
  }, initialDelayMs);

  // 2. Scheduled periodic interval
  cleanupIntervalHandle = setInterval(async () => {
    try {
      await cleanTempUploads(cleanupOpts);
    } catch (err: any) {
      console.error('[TempCleanup] Scheduled cleanup pass failed:', err.message);
    }
  }, intervalMs);
}

/**
 * Stops the periodic cleanup cron and clears all timers.
 */
export function stopTempCleanupCron(): void {
  if (startupTimeoutHandle) {
    clearTimeout(startupTimeoutHandle);
    startupTimeoutHandle = null;
  }

  if (cleanupIntervalHandle) {
    clearInterval(cleanupIntervalHandle);
    cleanupIntervalHandle = null;
  }

  console.log('[TempCleanup] 🛑 Stopped');
}

/**
 * Helper to check current running status (useful for tests and health endpoints).
 */
export function isTempCleanupCronRunning(): boolean {
  return cleanupIntervalHandle !== null || startupTimeoutHandle !== null;
}
