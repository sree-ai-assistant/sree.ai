import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';

// Provide dummy env vars before imports
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('axios');

import { aiService } from './ai.service';
import axios from 'axios';
import fs from 'fs';

describe('aiService.transcribeAudioParakeet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes language code en or en-US to en-GB and calls NVCF endpoint', async () => {
    const mockedPost = vi.mocked(axios.post).mockResolvedValueOnce({
      data: { text: 'Hello test transcription from Parakeet' },
      status: 200,
    } as any);

    vi.spyOn(fs, 'createReadStream').mockReturnValue(Readable.from([Buffer.from('fake audio')]) as any);

    const result = await aiService.transcribeAudioParakeet('nvapi-mock-key', '/tmp/sample.wav', 'en-US');

    expect(result).toEqual({ text: 'Hello test transcription from Parakeet' });
    expect(mockedPost).toHaveBeenCalledTimes(1);

    const [url, formData, config] = mockedPost.mock.calls[0] as any;
    expect(url).toContain('nvcf.nvidia.com');
    expect(config.headers.Authorization).toBe('Bearer nvapi-mock-key');
  });

  it('preserves valid European language codes such as de-DE', async () => {
    const mockedPost = vi.mocked(axios.post).mockResolvedValueOnce({
      data: { text: 'Guten Tag' },
      status: 200,
    } as any);

    vi.spyOn(fs, 'createReadStream').mockReturnValue(Readable.from([Buffer.from('fake audio')]) as any);

    const result = await aiService.transcribeAudioParakeet('nvapi-mock-key', '/tmp/sample.wav', 'de-DE');

    expect(result).toEqual({ text: 'Guten Tag' });
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it('throws and logs when the API returns an error', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce({
      response: {
        status: 500,
        data: { detail: 'Triton decoder error' },
      },
      message: 'Request failed with status code 500',
    });

    vi.spyOn(fs, 'createReadStream').mockReturnValue(Readable.from([Buffer.from('fake audio')]) as any);

    await expect(
      aiService.transcribeAudioParakeet('nvapi-mock-key', '/tmp/sample.wav')
    ).rejects.toThrow();
  });
});
