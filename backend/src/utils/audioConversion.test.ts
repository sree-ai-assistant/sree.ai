import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { convertTo16kHzMonoWav } from './audioConversion';

describe('audioConversion utility', () => {
  const testFilesToClean: string[] = [];

  afterEach(() => {
    for (const f of testFilesToClean) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    }
    testFilesToClean.length = 0;
  });

  it('throws an error if input file does not exist', async () => {
    await expect(
      convertTo16kHzMonoWav('/invalid/non_existent_path.wav')
    ).rejects.toThrow('Input file does not exist');
  });

  it('converts an existing audio file to 16kHz mono WAV successfully', async () => {
    const sampleAudioPath = path.resolve(__dirname, '../../../frontend/public/cant-hear-anything.wav');
    if (!fs.existsSync(sampleAudioPath)) {
      console.warn('Sample audio not found, skipping conversion execution test');
      return;
    }

    const convertedPath = await convertTo16kHzMonoWav(sampleAudioPath);
    testFilesToClean.push(convertedPath);

    expect(fs.existsSync(convertedPath)).toBe(true);
    expect(convertedPath.endsWith('.wav')).toBe(true);

    const stats = fs.statSync(convertedPath);
    expect(stats.size).toBeGreaterThan(0);
  });
});
