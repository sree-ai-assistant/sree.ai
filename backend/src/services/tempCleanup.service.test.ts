import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  cleanTempUploads,
  startTempCleanupCron,
  stopTempCleanupCron,
  isTempCleanupCronRunning,
} from './tempCleanup.service';

describe('TempCleanupService', () => {
  const testUploadsDir = path.join(process.cwd(), 'uploads_test_temp_cleanup');

  beforeEach(() => {
    // Ensure clean test directory before each test
    if (fs.existsSync(testUploadsDir)) {
      fs.rmSync(testUploadsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testUploadsDir, { recursive: true });
    fs.mkdirSync(path.join(testUploadsDir, 'avatars'), { recursive: true });
    fs.mkdirSync(path.join(testUploadsDir, 'frames'), { recursive: true });
    fs.mkdirSync(path.join(testUploadsDir, 'screenshots'), { recursive: true });
  });

  afterEach(() => {
    stopTempCleanupCron();
    if (fs.existsSync(testUploadsDir)) {
      fs.rmSync(testUploadsDir, { recursive: true, force: true });
    }
  });

  it('deletes files older than maxAgeMs and preserves newer files', async () => {
    const oldFile = path.join(testUploadsDir, 'stale_upload_123.tmp');
    const freshFile = path.join(testUploadsDir, 'active_upload_456.tmp');

    fs.writeFileSync(oldFile, 'old content');
    fs.writeFileSync(freshFile, 'fresh content');

    // Set oldFile mtime to 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, twoHoursAgo, twoHoursAgo);

    // Set freshFile mtime to 5 minutes ago
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    fs.utimesSync(freshFile, fiveMinutesAgo, fiveMinutesAgo);

    const result = await cleanTempUploads({
      maxAgeMs: 30 * 60 * 1000, // 30 minutes
      uploadsDir: testUploadsDir,
    });

    expect(result.scanned).toBe(2);
    expect(result.deleted).toBe(1);
    expect(result.bytesFreed).toBe('old content'.length);
    expect(result.deletedFiles).toEqual(['stale_upload_123.tmp']);

    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(freshFile)).toBe(true);
  });

  it('cleans old files in subdirectories (frames, avatars, screenshots)', async () => {
    const oldFrame = path.join(testUploadsDir, 'frames', 'frame_stale_1.png');
    const oldAvatar = path.join(testUploadsDir, 'avatars', 'avatar_stale_2.png');
    const oldScreenshot = path.join(testUploadsDir, 'screenshots', 'screen_stale_3.png');

    fs.writeFileSync(oldFrame, 'frame data');
    fs.writeFileSync(oldAvatar, 'avatar data');
    fs.writeFileSync(oldScreenshot, 'screenshot data');

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    fs.utimesSync(oldFrame, oneHourAgo, oneHourAgo);
    fs.utimesSync(oldAvatar, oneHourAgo, oneHourAgo);
    fs.utimesSync(oldScreenshot, oneHourAgo, oneHourAgo);

    const result = await cleanTempUploads({
      maxAgeMs: 30 * 60 * 1000,
      uploadsDir: testUploadsDir,
    });

    expect(result.deleted).toBe(3);
    expect(result.deletedFiles).toEqual(
      expect.arrayContaining([
        'frames/frame_stale_1.png',
        'avatars/avatar_stale_2.png',
        'screenshots/screen_stale_3.png',
      ])
    );
    expect(fs.existsSync(oldFrame)).toBe(false);
    expect(fs.existsSync(oldAvatar)).toBe(false);
    expect(fs.existsSync(oldScreenshot)).toBe(false);

    // Crucial: Subdirectories themselves must still exist!
    expect(fs.existsSync(path.join(testUploadsDir, 'frames'))).toBe(true);
    expect(fs.existsSync(path.join(testUploadsDir, 'avatars'))).toBe(true);
    expect(fs.existsSync(path.join(testUploadsDir, 'screenshots'))).toBe(true);
  });

  it('never deletes protected files (nothing.txt, .gitkeep, dotfiles)', async () => {
    const nothingFile = path.join(testUploadsDir, 'avatars', 'nothing.txt');
    const gitkeepFile = path.join(testUploadsDir, 'frames', '.gitkeep');
    const dotfile = path.join(testUploadsDir, '.hiddenfile');

    fs.writeFileSync(nothingFile, 'keep me');
    fs.writeFileSync(gitkeepFile, '');
    fs.writeFileSync(dotfile, 'dot file');

    // Make them very old (10 days ago)
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    fs.utimesSync(nothingFile, tenDaysAgo, tenDaysAgo);
    fs.utimesSync(dotfile, tenDaysAgo, tenDaysAgo);

    const result = await cleanTempUploads({
      maxAgeMs: 30 * 60 * 1000,
      uploadsDir: testUploadsDir,
    });

    expect(result.deleted).toBe(0);
    expect(fs.existsSync(nothingFile)).toBe(true);
    expect(fs.existsSync(gitkeepFile)).toBe(true);
    expect(fs.existsSync(dotfile)).toBe(true);
  });

  it('handles non-existent uploads directory gracefully', async () => {
    const nonExistent = path.join(process.cwd(), 'does_not_exist_uploads_xyz');
    const result = await cleanTempUploads({ uploadsDir: nonExistent });

    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('handles unlink errors (e.g. locked files) gracefully without crashing', async () => {
    const lockedFile = path.join(testUploadsDir, 'locked_file.tmp');
    fs.writeFileSync(lockedFile, 'locked');

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(lockedFile, twoHoursAgo, twoHoursAgo);

    // Mock unlinkSync to simulate Windows EBUSY / EPERM lock
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      const err: any = new Error('resource busy or locked');
      err.code = 'EBUSY';
      throw err;
    });

    const result = await cleanTempUploads({
      maxAgeMs: 30 * 60 * 1000,
      uploadsDir: testUploadsDir,
    });

    expect(result.errors).toBe(1);
    expect(result.deleted).toBe(0);

    unlinkSpy.mockRestore();
  });

  it('refuses to clean any directory that is not an uploads folder', async () => {
    const nonUploadsDir = path.join(process.cwd(), 'temp_test_other_dir');
    fs.mkdirSync(nonUploadsDir, { recursive: true });
    const dummyFile = path.join(nonUploadsDir, 'important.txt');
    fs.writeFileSync(dummyFile, 'do not delete');

    try {
      const result = await cleanTempUploads({ uploadsDir: nonUploadsDir });
      expect(result.deleted).toBe(0);
      expect(result.errors).toBe(1);
      expect(fs.existsSync(dummyFile)).toBe(true);
    } finally {
      fs.rmSync(nonUploadsDir, { recursive: true, force: true });
    }
  });

  it('starts and stops cron timers cleanly', () => {
    expect(isTempCleanupCronRunning()).toBe(false);

    startTempCleanupCron({ intervalMs: 10000, initialDelayMs: 1000 });
    expect(isTempCleanupCronRunning()).toBe(true);

    stopTempCleanupCron();
    expect(isTempCleanupCronRunning()).toBe(false);
  });
});
