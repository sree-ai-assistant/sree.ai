import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from 'ffmpeg-static';
import ffprobeInstaller from 'ffprobe-static';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';


if (ffmpegInstaller) {
  const ffmpegPath = typeof ffmpegInstaller === 'string' ? ffmpegInstaller : (ffmpegInstaller as any).path;
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
    console.log(`[VideoService] Set FFmpeg path: ${ffmpegPath}`);
  }
}

if (ffprobeInstaller) {
  const ffprobePath = typeof ffprobeInstaller === 'string' ? ffprobeInstaller : (ffprobeInstaller as any).path;
  if (ffprobePath) {
    ffmpeg.setFfprobePath(ffprobePath);
    console.log(`[VideoService] Set FFprobe path: ${ffprobePath}`);
  }
}

class VideoService {
  private readonly tempDir = path.join(process.cwd(), 'uploads', 'frames');

  constructor() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Gets the duration of a video in seconds using ffprobe
   */
  async getDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.error('[VideoService] ffprobe error:', err.message);
          reject(new Error(`Could not read video duration: ${err.message}`));
          return;
        }
        const duration = metadata?.format?.duration ?? 0;
        console.log(`[VideoService] Video duration: ${duration}s`);
        resolve(duration);
      });
    });
  }

  /**
   * Calculates optimal frame count (5-10) based on video duration.
   *   <= 30s  → 5 frames
   *   31-120s → 7 frames
   *   > 120s  → 10 frames
   */
  static optimalFrameCount(durationSec: number): number {
    if (durationSec <= 30) return 5;
    if (durationSec <= 120) return 7;
    return 10;
  }

  /**
   * Extracts frames from a video at specific intervals
   * @param videoPath Local path to the video file
   * @param frameCount Number of frames to extract
   * @returns Array of local paths to extracted frames
   */
  async extractFrames(videoPath: string, frameCount: number = 5): Promise<string[]> {
    console.log(`[VideoService] Starting frame extraction (${frameCount} frames) for: ${videoPath}`);
    
    if (!fs.existsSync(videoPath)) {
      console.error(`[VideoService] Video file not found: ${videoPath}`);
      throw new Error(`Video file not found at ${videoPath}`);
    }

    const stats = fs.statSync(videoPath);
    console.log(`[VideoService] Video file size: ${stats.size} bytes`);

    return new Promise((resolve, reject) => {
      const framePaths: string[] = [];
      const prefix = crypto.randomUUID();
      console.log(`[VideoService] Using prefix ${prefix} for frames in ${this.tempDir}`);
      
      const command = ffmpeg(videoPath)
        .on('start', (commandLine) => {
          console.log(`[VideoService] FFmpeg process started with command: ${commandLine}`);
        })
        .on('filenames', (filenames: string[]) => {
          console.log(`[VideoService] FFmpeg will generate: ${filenames.join(', ')}`);
          filenames.forEach(file => framePaths.push(path.join(this.tempDir, file)));
        })
        .on('progress', (progress) => {
          console.log(`[VideoService] Extraction progress: ${JSON.stringify(progress)}`);
        })
        .on('end', () => {
          console.log(`[VideoService] FFmpeg finished successfully`);
          // Give the OS a moment to sync files to disk (sometimes needed on Windows)
          setTimeout(() => {
            const existingFrames = framePaths.filter(p => fs.existsSync(p));
            console.log(`[VideoService] Verified ${existingFrames.length}/${framePaths.length} frame files on disk`);
            resolve(existingFrames);
          }, 500);
        })
        .on('error', (err, stdout, stderr) => {
          console.error('[VideoService] FFmpeg Error:', err.message);
          console.error('[VideoService] FFmpeg Stderr:', stderr);
          reject(new Error(`FFmpeg failed: ${err.message}`));
        })
        .screenshots({
          count: frameCount,
          folder: this.tempDir,
          filename: `${prefix}-at-%s-seconds.png`,
          size: '1280x?' // Maintain aspect ratio
        });
    });
  }

  /**
   * Cleans up extracted frame files
   */
  cleanup(paths: string[]) {
    paths.forEach(p => {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    });
  }
}

export { VideoService };
export const videoService = new VideoService();
