import toast from 'react-hot-toast';
import { aiService } from '../lib/api';
import { useUsageStore } from '../store/usage.store';
import { useAuthStore } from '../store/auth.store';
import { useUIStore } from '../store/ui.store';
import { exportMarkdownToDocx } from './docxExporter';
import { exportMarkdownToPptx } from './pptxExporter';
import { exportMarkdownToPdf } from './pdfExporter';

export type ExportFormat = 'docx' | 'pptx' | 'pdf' | 'md';

export interface ExportOptions {
  title?: string;
  author?: string;
  includeMetadata?: boolean;
  theme?: any;
  showWatermark?: boolean;
}


/**
 * Sanitizes a title string for use in safe filenames
 */
function sanitizeFilename(title?: string): string {
  if (!title) return 'document';
  return title
    .replace(/[^\w\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40) || 'document';
}

/**
 * Helper to trigger native browser file save from a Blob
 */
function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Universal document export handler for chat messages
 */
export async function exportDocument(
  format: ExportFormat,
  markdownContent: string,
  options?: ExportOptions
): Promise<boolean> {
  const cleanContent = markdownContent.trim();
  if (!cleanContent) {
    toast.error('No content available to export.');
    return false;
  }

  // Derive filename
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeTitle = sanitizeFilename(options?.title);
  const filename = `${safeTitle}_${dateStr}.${format}`;

  try {
    // 1. Charge download credit & verify rate limits on backend
    await aiService.trackDownload(format);

    // 2. Increment local usage store for instant counter reflection
    useUsageStore.getState().incrementLocalUsage('download', 1);

    // 3. Generate file blob based on format
    let blob: Blob;

    if (format === 'docx') {
      blob = await exportMarkdownToDocx(cleanContent, {
        title: options?.title,
        author: options?.includeMetadata ? options?.author : undefined,
      });
      triggerBlobDownload(blob, filename);
      toast.success('Downloaded Word document (.docx)');
    } else if (format === 'pptx') {
      // Free and anonymous users receive the subtle Sree AI clickable watermark badge
      const user = useAuthStore.getState().user;
      const usageStatus = useUsageStore.getState().usageStatus;
      const currentTier = (user?.plan_type || usageStatus?.tier || 'anonymous').toLowerCase();
      const isPaidUser = currentTier === 'starter' || currentTier === 'pro';
      const showWatermark = options?.showWatermark !== undefined ? options.showWatermark : !isPaidUser;

      blob = await exportMarkdownToPptx(cleanContent, {
        title: options?.title,
        author: options?.includeMetadata ? options?.author : undefined,
        includeMetadata: options?.includeMetadata,
        theme: options?.theme,
        showWatermark,
      });
      triggerBlobDownload(blob, filename);
      toast.success('Downloaded PowerPoint presentation (.pptx)');

    } else if (format === 'pdf') {
      blob = await exportMarkdownToPdf(cleanContent, {
        title: options?.title,
        author: options?.includeMetadata ? options?.author : undefined,
        includeMetadata: options?.includeMetadata,
      });
      triggerBlobDownload(blob, filename);
      toast.success('Downloaded PDF document (.pdf)');
    } else if (format === 'md') {
      blob = new Blob([cleanContent], { type: 'text/markdown;charset=utf-8;' });
      triggerBlobDownload(blob, filename);
      toast.success('Downloaded Markdown file (.md)');
    }

    return true;
  } catch (err: any) {
    console.error(`[ExportService] Error exporting ${format}:`, err);

    if (err?.response?.status === 429) {
      const errorData = err?.response?.data;
      useUIStore.getState().openDownloadLimitModal({
        tier: errorData?.tier,
        reason: errorData?.reason || 'daily',
        limit: errorData?.limit,
        current: errorData?.current,
        resetsIn: errorData?.resetsIn,
        message: errorData?.message,
      });
    } else if (err?.response?.status === 401) {
      toast.error('Please sign in to download files.');
    } else {
      toast.error(err?.response?.data?.message || `Failed to export ${format.toUpperCase()} file.`);
    }
    return false;
  }
}
