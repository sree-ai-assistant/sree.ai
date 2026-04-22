import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from 'ffmpeg-static';
import ffprobeInstaller from 'ffprobe-static';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';


if (ffmpegInstaller) {
  ffmpeg.setFfmpegPath(ffmpegInstaller);
}

if (ffprobeInstaller && ffprobeInstaller.path) {
  ffmpeg.setFfprobePath(ffprobeInstaller.path);
}

class VideoService {
  private readonly tempDir = path.join(process.cwd(), 'uploads', 'frames');

  constructor() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Extracts frames from a video at specific intervals
   * @param videoPath Local path to the video file
   * @param frameCount Number of frames to extract
   * @returns Array of local paths to extracted frames
   */
  async extractFrames(videoPath: string, frameCount: number = 3): Promise<string[]> {
    console.log(`[VideoService] Starting frame extraction for: ${videoPath}`);
    
    if (!fs.existsSync(videoPath)) {
      console.error(`[VideoService] Video file not found: ${videoPath}`);
      throw new Error(`Video file not found at ${videoPath}`);
    }

    return new Promise((resolve, reject) => {
      const framePaths: string[] = [];
      const prefix = crypto.randomUUID();
      console.log(`[VideoService] Using prefix ${prefix} for frames in ${this.tempDir}`);
      
      ffmpeg(videoPath)
        .on('filenames', (filenames: string[]) => {
          console.log(`[VideoService] FFmpeg generated filenames: ${filenames.join(', ')}`);
          filenames.forEach(file => framePaths.push(path.join(this.tempDir, file)));
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`[VideoService] Extraction progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log(`[VideoService] Successfully extracted ${framePaths.length} frames`);
          // Verify files actually exist
          const existingFrames = framePaths.filter(p => fs.existsSync(p));
          console.log(`[VideoService] Verified ${existingFrames.length}/${framePaths.length} frame files on disk`);
          resolve(existingFrames);
        })
        .on('error', (err) => {
          console.error('[VideoService] FFmpeg Error:', err.message);
          reject(err);
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

export const videoService = new VideoService();
