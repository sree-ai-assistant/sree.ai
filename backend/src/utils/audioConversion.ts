import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Configure FFmpeg binary path from ffmpeg-static
if (ffmpegInstaller) {
  const ffmpegPath = typeof ffmpegInstaller === 'string' ? ffmpegInstaller : (ffmpegInstaller as any).path;
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }
}

/**
 * Converts any audio file (WebM, MP4, OGG, WAV, etc.) to 16kHz Mono 16-bit PCM WAV.
 * This exact format is strictly required by NVIDIA Parakeet / NeMo ASR.
 *
 * @param inputPath - Full path to source audio file on disk
 * @param outputDir - Optional target directory (defaults to dirname of input file)
 * @returns Promise resolving to the full path of the converted .wav file
 */
export async function convertTo16kHzMonoWav(
  inputPath: string,
  outputDir?: string
): Promise<string> {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`[AudioConversion] Input file does not exist: ${inputPath}`);
  }

  const stat = fs.statSync(inputPath);
  if (stat.size === 0) {
    throw new Error(`[AudioConversion] Input audio file is empty (0 bytes): ${inputPath}`);
  }

  const targetDir = outputDir || path.dirname(inputPath);
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const outputPath = path.join(targetDir, `parakeet-${Date.now()}-${randomSuffix}.wav`);

  return new Promise((resolve, reject) => {
    let hasTimedOut = false;
    let command: ffmpeg.FfmpegCommand | null = null;

    const timeoutHandle = setTimeout(() => {
      hasTimedOut = true;
      if (command) {
        try { command.kill('SIGKILL'); } catch {}
      }
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch {}
      reject(new Error('[AudioConversion] FFmpeg conversion timed out after 30 seconds'));
    }, 30_000);

    command = ffmpeg(inputPath)
      .toFormat('wav')
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec('pcm_s16le')
      .on('end', () => {
        if (hasTimedOut) return;
        clearTimeout(timeoutHandle);
        resolve(outputPath);
      })
      .on('error', (err: any) => {
        if (hasTimedOut) return;
        clearTimeout(timeoutHandle);
        // Clean up partial output if created
        try {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch {}
        console.error('[AudioConversion] FFmpeg error:', err.message);
        reject(new Error(`[AudioConversion] FFmpeg conversion failed: ${err.message}`));
      });

    command.save(outputPath);
  });
}
