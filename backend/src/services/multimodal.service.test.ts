import { describe, it, expect, vi, beforeEach } from 'vitest';
import { multimodalService, getMimeType } from './multimodal.service';
import { aiService } from './ai.service';
import { fileService } from './file.service';
import { videoService } from './video.service';
import { r2Service } from './r2.service';
import fs from 'fs';

// Mock dependencies
vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { metadata: {} } }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  },
}));

describe('MultimodalService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMimeType', () => {
    it('resolves standard video formats correctly', () => {
      expect(getMimeType('sample.mp4')).toBe('video/mp4');
      expect(getMimeType('movie.webm')).toBe('video/webm');
      expect(getMimeType('clip.mov')).toBe('video/quicktime');
    });

    it('resolves audio formats correctly', () => {
      expect(getMimeType('voice.mp3')).toBe('audio/mp3');
      expect(getMimeType('memo.wav')).toBe('audio/wav');
      expect(getMimeType('track.ogg')).toBe('audio/ogg');
    });

    it('resolves documents and images correctly', () => {
      expect(getMimeType('doc.pdf')).toBe('application/pdf');
      expect(getMimeType('photo.png')).toBe('image/png');
      expect(getMimeType('avatar.jpg')).toBe('image/jpeg');
    });

    it('falls back to default for unknown extensions', () => {
      expect(getMimeType('archive.xyz', 'application/octet-stream')).toBe('application/octet-stream');
    });
  });

  describe('processRequestAttachments - Google Gemini Native Support', () => {
    it('packages small video files as native inlineData without frame extraction', async () => {
      const mockWriteSSE = vi.fn();
      const tempPath = 'test-video.mp4';
      const fileBytes = Buffer.from('fake-video-content');

      vi.spyOn(fileService, 'downloadFile').mockResolvedValue(tempPath as any);
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 } as any);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(fileBytes as any);
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const extractFramesSpy = vi.spyOn(videoService, 'extractFrames');

      const result = await multimodalService.processRequestAttachments({
        attachments: [{ name: 'demo.mp4', type: 'video', url: 'https://r2.example.com/demo.mp4' }],
        model: 'gemini-2.5-flash',
        provider: 'google',
        modelInfo: { is_vision: true },
        apiKey: 'test-google-key',
        writeSSE: mockWriteSSE,
      });

      // Crucial: Frame extraction MUST NOT be called for Google Gemini!
      expect(extractFramesSpy).not.toHaveBeenCalled();

      // Native inlineData must be delivered
      expect(result.parts).toHaveLength(1);
      expect(result.parts[0]).toEqual({
        inlineData: {
          mimeType: 'video/mp4',
          data: fileBytes.toString('base64'),
        },
      });

      // Clean attachments must preserve the original video (not 5 frame PNGs)
      expect(result.cleanAttachments).toHaveLength(1);
      expect(result.cleanAttachments[0]?.type).toBe('video');
    });

    it('uploads large video files (> 20MB) to Google File API and returns fileData', async () => {
      const mockWriteSSE = vi.fn();
      const largeBytes = 25 * 1024 * 1024; // 25 MB

      vi.spyOn(fileService, 'downloadFile').mockResolvedValue('large-video.mp4' as any);
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: largeBytes } as any);
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const uploadFileGoogleSpy = vi.spyOn(aiService, 'uploadFileGoogle').mockResolvedValue({
        fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123xyz',
        mimeType: 'video/mp4',
        name: 'files/abc123xyz',
      });

      const result = await multimodalService.processRequestAttachments({
        attachments: [{ name: 'large.mp4', type: 'video', url: 'https://r2.example.com/large.mp4' }],
        model: 'gemini-2.5-flash',
        provider: 'google',
        modelInfo: { is_vision: true },
        apiKey: 'test-google-key',
        writeSSE: mockWriteSSE,
      });

      expect(uploadFileGoogleSpy).toHaveBeenCalledWith('test-google-key', expect.any(String), 'video/mp4', 'large.mp4');
      expect(result.parts).toHaveLength(1);
      expect(result.parts[0]).toEqual({
        fileData: {
          fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123xyz',
          mimeType: 'video/mp4',
        },
      });
    });

    it('packages PDF documents directly as native inlineData for Gemini', async () => {
      const mockWriteSSE = vi.fn();
      const pdfBytes = Buffer.from('%PDF-1.4 fake pdf data');

      vi.spyOn(fileService, 'downloadFile').mockResolvedValue('test.pdf' as any);
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 5000 } as any);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(pdfBytes as any);
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const extractTextSpy = vi.spyOn(fileService, 'extractText');

      const result = await multimodalService.processRequestAttachments({
        attachments: [{ name: 'document.pdf', type: 'document', url: 'https://r2.example.com/doc.pdf' }],
        model: 'gemini-2.5-flash',
        provider: 'google',
        modelInfo: { is_vision: true },
        apiKey: 'test-google-key',
        writeSSE: mockWriteSSE,
      });

      // No text extraction needed for native PDF on Gemini
      expect(extractTextSpy).not.toHaveBeenCalled();
      expect(result.parts).toHaveLength(1);
      expect(result.extractedContext).toContain('document.pdf');
      expect(result.parts[0]).toEqual({
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfBytes.toString('base64'),
        },
      });
    });

    it('packages audio files directly as native inlineData with context instructions for Gemini', async () => {
      const mockWriteSSE = vi.fn();
      const audioBytes = Buffer.from('fake audio data');

      vi.spyOn(fileService, 'downloadFile').mockResolvedValue('test.mp3' as any);
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 12000 } as any);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(audioBytes as any);
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const result = await multimodalService.processRequestAttachments({
        attachments: [{ name: 'bell.mp3', type: 'audio', url: 'https://r2.example.com/bell.mp3' }],
        model: 'gemini-2.5-flash',
        provider: 'google',
        modelInfo: { is_vision: true },
        apiKey: 'test-google-key',
        writeSSE: mockWriteSSE,
      });

      expect(result.parts).toHaveLength(1);
      expect(result.extractedContext).toContain('bell.mp3');
      expect(result.extractedContext).toContain('listen carefully to the attached audio');
      expect(result.parts[0]).toEqual({
        inlineData: {
          mimeType: 'audio/mp3',
          data: audioBytes.toString('base64'),
        },
      });
    });
  });

  describe('processRequestAttachments - Groq & NVIDIA Fallbacks', () => {
    it('uses frame extraction fallback for Groq vision models, capped at 3 frames', async () => {
      const mockWriteSSE = vi.fn();
      vi.spyOn(fileService, 'downloadFile').mockResolvedValue('groq-video.mp4' as any);
      vi.spyOn(videoService, 'getDuration').mockResolvedValue(10);
      vi.spyOn(videoService, 'extractFrames').mockResolvedValue(['frame1.png', 'frame2.png', 'frame3.png']);
      vi.spyOn(videoService, 'cleanup').mockImplementation(() => {});
      vi.spyOn(r2Service, 'uploadFile').mockResolvedValue('https://r2.example.com/frame.png');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const result = await multimodalService.processRequestAttachments({
        attachments: [{ name: 'groq-clip.mp4', type: 'video', url: 'https://r2.example.com/groq.mp4' }],
        model: 'qwen/qwen3.8-27b',
        provider: 'groq',
        modelInfo: { is_vision: true, img_no_can_process: 3 },
        apiKey: 'test-groq-key',
        writeSSE: mockWriteSSE,
      });

      // For Groq vision, extracted frames are sent as image_url
      expect(videoService.extractFrames).toHaveBeenCalledWith(expect.any(String), 3);
      expect(result.parts).toHaveLength(3);
      expect(result.parts[0]).toEqual({
        type: 'image_url',
        image_url: { url: 'https://r2.example.com/frame.png' },
      });
      expect(result.extractedContext).toContain('key visual frames from the video');
    });

    it('uses Groq Whisper STT fallback for audio when provider is Groq', async () => {
      const mockWriteSSE = vi.fn();
      vi.spyOn(fileService, 'downloadFile').mockResolvedValue('groq-audio.mp3' as any);
      vi.spyOn(aiService, 'transcribeAudioGroq').mockResolvedValue({ text: 'Hello from Groq Whisper transcript' });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const result = await multimodalService.processRequestAttachments({
        attachments: [{ name: 'voice.mp3', type: 'audio', url: 'https://r2.example.com/voice.mp3' }],
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
        modelInfo: { is_vision: false },
        apiKey: 'test-groq-key',
        writeSSE: mockWriteSSE,
      });

      expect(aiService.transcribeAudioGroq).toHaveBeenCalledWith(
        'test-groq-key',
        expect.any(String),
        'whisper-large-v3-turbo',
        'voice.mp3'
      );
      expect(result.extractedContext).toContain('Hello from Groq Whisper transcript');
      expect(result.parts).toHaveLength(0);
    });
  });

  describe('DOCX and Excel/Spreadsheet handling', () => {
    it('uses pre-extracted text for DOCX files without re-downloading', async () => {
      const mockWriteSSE = vi.fn();
      const extractTextSpy = vi.spyOn(fileService, 'extractText');

      const result = await multimodalService.processRequestAttachments({
        attachments: [{
          name: 'report.docx',
          type: 'document',
          url: 'https://r2.example.com/report.docx',
          extractedText: 'Pre-extracted DOCX content from browser mammoth',
        }],
        model: 'gemini-2.5-flash',
        provider: 'google',
        modelInfo: { is_vision: true },
        apiKey: 'test-google-key',
        writeSSE: mockWriteSSE,
      });

      // Does not re-download or re-parse on backend
      expect(extractTextSpy).not.toHaveBeenCalled();
      expect(result.extractedContext).toContain('Pre-extracted DOCX content from browser mammoth');
      expect(result.cleanAttachments[0]?.name).toBe('report.docx');
      expect(result.cleanAttachments[0]?.type).toBe('document');
    });

    it('falls back to backend text extraction for Excel (.xlsx) files when no pre-extracted text is present', async () => {
      const mockWriteSSE = vi.fn();
      vi.spyOn(fileService, 'extractText').mockResolvedValue('Sheet 1: ColA, ColB\n1, 2\n3, 4');

      const result = await multimodalService.processRequestAttachments({
        attachments: [{
          name: 'financials.xlsx',
          type: 'document',
          url: 'https://r2.example.com/financials.xlsx',
        }],
        model: 'qwen/qwen3.8-27b',
        provider: 'groq',
        modelInfo: { is_vision: true },
        apiKey: 'test-groq-key',
        writeSSE: mockWriteSSE,
      });

      expect(fileService.extractText).toHaveBeenCalledWith('https://r2.example.com/financials.xlsx', 'financials.xlsx');
      expect(result.extractedContext).toContain('Sheet 1: ColA, ColB');
      expect(result.cleanAttachments[0]?.name).toBe('financials.xlsx');
      expect(result.cleanAttachments[0]?.type).toBe('document');
    });

    it('gracefully falls back to visual frame extraction if Google File API upload fails for large video', async () => {
      const mockWriteSSE = vi.fn();
      vi.spyOn(fileService, 'downloadFile').mockResolvedValue(undefined as any);
      vi.spyOn(fs, 'statSync').mockReturnValue({ size: 25 * 1024 * 1024 } as any);
      vi.spyOn(aiService, 'uploadFileGoogle').mockRejectedValue(new Error('Request failed with status code 400'));
      vi.spyOn(videoService, 'extractFrames').mockResolvedValue(['frame1.png', 'frame2.png']);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fake-png-bytes') as any);
      vi.spyOn(videoService, 'cleanup').mockReturnValue(undefined as any);

      const result = await multimodalService.processRequestAttachments({
        attachments: [{
          name: 'large-error.mp4',
          type: 'video',
          url: 'https://r2.example.com/large-error.mp4',
        }],
        model: 'gemini-2.5-flash',
        provider: 'google',
        modelInfo: { is_vision: true },
        apiKey: 'test-google-key',
        writeSSE: mockWriteSSE,
      });

      expect(aiService.uploadFileGoogle).toHaveBeenCalled();
      expect(videoService.extractFrames).toHaveBeenCalled();
      expect(result.parts.length).toBe(2);
      expect(result.parts[0]?.inlineData?.mimeType).toBe('image/png');
      expect(result.extractedContext).toContain('could not be uploaded natively');
    });
  });
});
