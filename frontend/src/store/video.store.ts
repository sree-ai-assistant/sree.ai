import { create } from 'zustand';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { useUsageStore } from './usage.store';

export interface GeneratedVideo {
  id: string;
  url: string;
  videoUrl?: string; // compatibility with frontend properties
  prompt: string;
  model: string;
  ratio: string;
  speed_tier: string;
  include_audio: boolean;
  created_at: string;
}

export interface VideoSettings {
  prompt: string;
  modelId: string;
  ratioIndex: number; // 0: 16:9, 1: 9:16
  speedTier: 'standard' | 'fast' | 'lite';
  includeAudio: boolean;
  outputsCount: number; // 1 to 4
  inputUrl: string | null;
  lastFrameUrl: string | null;
  duration: number; // 4, 6, 8, 10
  useByok: boolean;
}

interface VideoState {
  history: GeneratedVideo[];
  activeVideo: GeneratedVideo | null;
  activeVideos: GeneratedVideo[];
  isGenerating: boolean;
  isFetchingHistory: boolean;
  settings: VideoSettings;
  
  fetchHistory: () => Promise<void>;
  updateSettings: (settings: Partial<VideoSettings>) => void;
  generateVideo: () => Promise<void>;
  deleteVideo: (id: string) => Promise<void>;
  setActiveVideo: (video: GeneratedVideo | null) => void;
  setActiveVideos: (videos: GeneratedVideo[]) => void;
  clearStore: () => void;
}

const DEFAULT_SETTINGS: VideoSettings = {
  prompt: '',
  modelId: 'veo-3.1-fast-generate-preview',
  ratioIndex: 0,
  speedTier: 'fast',
  includeAudio: true,
  outputsCount: 1,
  inputUrl: null,
  lastFrameUrl: null,
  duration: 8,
  useByok: true,
};

let activeHistoryPromise: Promise<void> | null = null;

export const useVideoStore = create<VideoState>((set, get) => ({
  history: [],
  activeVideo: null,
  activeVideos: [],
  isGenerating: false,
  isFetchingHistory: false,
  settings: DEFAULT_SETTINGS,

  updateSettings: (newSettings) => set((state) => ({
    settings: { ...state.settings, ...newSettings }
  })),

  fetchHistory: async () => {
    if (activeHistoryPromise) {
      return activeHistoryPromise;
    }

    const promise = (async () => {
      set({ isFetchingHistory: true });
      try {
        const response = await api.get('/ai/videos');
        if (response.data.success) {
          const mapped = response.data.data.map((vid: any) => ({
            id: vid.id,
            url: vid.url,
            videoUrl: vid.url, // map DB 'url' to 'videoUrl'
            prompt: vid.prompt,
            model: vid.model,
            ratio: vid.aspect_ratio || '16:9',
            speed_tier: vid.resolution === '4k' ? 'standard' : vid.resolution === '1080p' ? 'fast' : 'lite',
            include_audio: true, // legacy field fallback
            created_at: vid.created_at,
          }));
          set({ history: mapped });
        }
      } catch (error) {
        console.error('History fetch error:', error);
      } finally {
        set({ isFetchingHistory: false });
      }
    })();

    activeHistoryPromise = promise;

    try {
      await promise;
    } finally {
      if (activeHistoryPromise === promise) {
        activeHistoryPromise = null;
      }
    }
  },

  setActiveVideo: (video) => {
    set({ activeVideo: video, activeVideos: video ? [video] : [] });
    if (video) {
      const ratioMap: Record<string, number> = { '16:9': 0, '9:16': 1, '1:1': 0 };
      set((state) => ({
        settings: {
          ...state.settings,
          prompt: video.prompt,
          modelId: video.model,
          ratioIndex: ratioMap[video.ratio] ?? 0,
          speedTier: (video.speed_tier as any) ?? 'fast',
          includeAudio: video.include_audio
        }
      }));
    }
  },

  setActiveVideos: (videos) => {
    set({ activeVideos: videos, activeVideo: videos[0] || null });
  },

  generateVideo: async () => {
    const { settings, history } = get();
    if (!settings.prompt.trim()) {
      toast.error('Please enter a prompt first.');
      return;
    }

    set({ isGenerating: true, activeVideo: null, activeVideos: [] });
    
    try {
      const ratioStr = settings.ratioIndex === 0 ? '16:9' : '9:16';
      // Map speedTier to resolution
      const resolution = settings.speedTier === 'lite' ? '720p' : settings.speedTier === 'fast' ? '1080p' : '4k';

      const count = settings.outputsCount || 1;
      const promises = Array.from({ length: count }).map(() =>
        api.post('/ai/video', {
          prompt: settings.prompt,
          model: settings.modelId,
          resolution: resolution,
          aspectRatio: ratioStr,
          durationSeconds: settings.duration || 8,
          fileUrl: settings.inputUrl || undefined,
          lastFrameUrl: settings.lastFrameUrl || undefined,
          useByok: settings.useByok
        })
      );

      const results = await Promise.all(promises);
      const newVideos: GeneratedVideo[] = [];

      results.forEach((response, idx) => {
        if (response.data.success) {
          // Increment usage count locally immediately after a successful request
          useUsageStore.getState().incrementLocalUsage('video', response.data.data?.creditsCharged || 1);

          const videoData = response.data.data.video;
          const newVideo: GeneratedVideo = {
            id: videoData.id || Math.random().toString(36).substring(7) + '_' + idx,
            url: videoData.url,
            videoUrl: videoData.url,
            prompt: videoData.prompt,
            model: videoData.model,
            ratio: videoData.aspect_ratio || ratioStr,
            speed_tier: settings.speedTier,
            include_audio: settings.includeAudio,
            created_at: videoData.created_at || new Date().toISOString(),
          };
          newVideos.push(newVideo);
        }
      });

      if (newVideos.length > 0) {
        set({
          history: [...newVideos, ...history],
          activeVideo: newVideos[0],
          activeVideos: newVideos,
          isGenerating: false,
        });

        toast.success(`${newVideos.length} video(s) generated successfully!`);
      } else {
        throw new Error('No video data received from the server.');
      }
    } catch (error: any) {
      set({ isGenerating: false });
      toast.error(error.response?.data?.message || 'Failed to generate video(s)');
      throw error;
    }
  },

  deleteVideo: async (id) => {
    try {
      await api.delete(`/ai/video/${id}`);
      set((state) => ({
        history: state.history.filter((vid) => vid.id !== id),
        activeVideo: state.activeVideo?.id === id ? null : state.activeVideo,
        activeVideos: state.activeVideos.filter((vid) => vid.id !== id),
      }));
      toast.success('Video deleted successfully.');
    } catch (error: any) {
      toast.error('Failed to delete video.');
    }
  },

  clearStore: () => {
    set({
      history: [],
      activeVideo: null,
      activeVideos: [],
      isGenerating: false,
      isFetchingHistory: false,
      settings: DEFAULT_SETTINGS,
    });
  }
}));
