/**
 * AudioWorklet wrapper for Gemini Live API PCM streaming.
 * 
 * Manages the lifecycle of:
 * - PcmCaptureProcessor: Mic → 16kHz 16-bit PCM for upstream
 * - PcmPlaybackProcessor: 24kHz 16-bit PCM from upstream → Speakers
 */

export interface LiveAudioConfig {
  onPcmData: (pcmBuffer: ArrayBuffer) => void;
  onAmplitude?: (value: number) => void;
  onPlaybackEnded?: () => void;
}

export class LiveAudioManager {
  private audioContext: AudioContext | null = null;
  private captureNode: AudioWorkletNode | null = null;
  private playbackNode: AudioWorkletNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private config: LiveAudioConfig;
  private _isInitialized = false;
  private _isCaptureActive = false;

  constructor(config: LiveAudioConfig) {
    this.config = config;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isCaptureActive(): boolean {
    return this._isCaptureActive;
  }

  /**
   * Initialize AudioContext and load worklet processors.
   * Must be called after a user gesture (click/tap).
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 48000, // High quality context, worklet handles downsampling
    });

    // Load the worklet processor file from /public
    await this.audioContext.audioWorklet.addModule('/pcmWorklet.js');

    this._isInitialized = true;
  }

  /**
   * Start capturing microphone audio and sending PCM data.
   */
  async startCapture(): Promise<MediaStream> {
    if (!this._isInitialized || !this.audioContext) {
      throw new Error('LiveAudioManager not initialized. Call initialize() first.');
    }

    // Resume context if suspended (autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Get microphone access
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      },
    });

    // Create source node from mic
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // Create capture worklet node
    this.captureNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor');

    // Handle messages from capture processor
    this.captureNode.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'pcm') {
        this.config.onPcmData(e.data.data);
      } else if (e.data.type === 'amplitude') {
        this.config.onAmplitude?.(e.data.value);
      }
    };

    // Connect: mic → capture processor (→ nowhere, we don't want to hear ourselves)
    this.sourceNode.connect(this.captureNode);
    // captureNode output is NOT connected to destination — we just capture, don't echo

    this._isCaptureActive = true;
    return this.mediaStream;
  }

  /**
   * Stop capturing microphone audio.
   */
  stopCapture(): void {
    this._isCaptureActive = false;

    if (this.captureNode) {
      this.captureNode.port.postMessage({ type: 'stop' });
      this.captureNode.disconnect();
      this.captureNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => {
        track.stop();
      });
      this.mediaStream = null;
    }
  }

  /**
   * Start the playback pipeline. Call once, then feed PCM via enqueuePcm().
   */
  startPlayback(): void {
    if (!this._isInitialized || !this.audioContext) return;

    if (this.playbackNode) return; // Already started

    this.playbackNode = new AudioWorkletNode(this.audioContext, 'pcm-playback-processor');

    this.playbackNode.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'playback-ended') {
        this.config.onPlaybackEnded?.();
      } else if (e.data.type === 'amplitude') {
        this.config.onAmplitude?.(e.data.value);
      }
    };

    // Connect playback processor to speakers
    this.playbackNode.connect(this.audioContext.destination);
  }

  /**
   * Enqueue raw 24kHz 16-bit PCM data for playback.
   */
  enqueuePcm(pcmBuffer: ArrayBuffer): void {
    if (!this.playbackNode) return;
    this.playbackNode.port.postMessage(
      { type: 'pcm', data: pcmBuffer },
      [pcmBuffer]
    );
  }

  /**
   * Clear all queued playback audio (e.g., on barge-in).
   */
  clearPlayback(): void {
    if (!this.playbackNode) return;
    this.playbackNode.port.postMessage({ type: 'clear' });
  }

  /**
   * Full cleanup — release all resources.
   */
  destroy(): void {
    this.stopCapture();

    if (this.playbackNode) {
      this.playbackNode.port.postMessage({ type: 'stop' });
      this.playbackNode.disconnect();
      this.playbackNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this._isInitialized = false;
  }
}
