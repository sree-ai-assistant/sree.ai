/**
 * AudioWorklet wrapper for Gemini Live API PCM streaming.
 * 
 * Manages the lifecycle of:
 * - PcmCaptureProcessor: Mic → 16kHz 16-bit PCM for upstream
 * - PcmPlaybackProcessor: 24kHz 16-bit PCM from upstream → Speakers
 * 
 * Mobile Audio Routing Architecture:
 * - Decouples mic capture AudioContext from speaker playback AudioContext to prevent
 *   mobile browsers from locking playback into a telephone earpiece communication loop.
 * - On mobile (iOS Safari & Android Chrome), pipes playback through a MediaStreamAudioDestinationNode
 *   and an HTML5 <audio playsinline autoplay> element to route to the loudspeaker.
 * - Uses a Destination GainNode to cleanly toggle between Loudspeaker and Handset without double-audio or click artifacts.
 * - Coordinates with W3C navigator.audioSession and setSinkId where supported.
 */

export interface LiveAudioConfig {
  onPcmData: (pcmBuffer: ArrayBuffer) => void;
  onAmplitude?: (value: number) => void;
  onPlaybackEnded?: () => void;
}

export class LiveAudioManager {
  private captureContext: AudioContext | null = null;
  private playbackContext: AudioContext | null = null;
  private captureNode: AudioWorkletNode | null = null;
  private playbackNode: AudioWorkletNode | null = null;
  private destinationGainNode: GainNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private playbackStreamDest: MediaStreamAudioDestinationNode | null = null;
  private playbackAudioEl: HTMLAudioElement | null = null;
  private config: LiveAudioConfig;
  private _isInitialized = false;
  private _isCaptureActive = false;
  private _isSpeakerphone = true;
  private _isDestinationFallback = false;

  constructor(config: LiveAudioConfig) {
    this.config = config;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isCaptureActive(): boolean {
    return this._isCaptureActive;
  }

  get isSpeakerphoneOn(): boolean {
    return this._isSpeakerphone;
  }

  /**
   * Initialize AudioContexts and load worklet processors.
   * Uses separate contexts for capture and playback so microphone stream
   * does not force playback output into the phone earpiece receiver.
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;

    // Hint iOS Safari audio session type if supported
    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      try {
        (navigator as any).audioSession.type = 'play-and-record';
      } catch (e) {
        console.warn('[LiveAudio] AudioSession configuration notice:', e);
      }
    }

    // 1. Context strictly for capturing microphone input
    this.captureContext = new AudioContextClass({
      sampleRate: 48000,
      latencyHint: 'interactive',
    });

    // 2. Separate context strictly for speaker playback (no mic input attached)
    this.playbackContext = new AudioContextClass({
      sampleRate: 48000,
      latencyHint: 'interactive',
    });

    // Load the worklet processor file from /public on both contexts
    await Promise.all([
      this.captureContext.audioWorklet.addModule('/pcmWorklet.js'),
      this.playbackContext.audioWorklet.addModule('/pcmWorklet.js'),
    ]);

    this._isInitialized = true;
  }

  /**
   * Start capturing microphone audio and sending PCM data.
   */
  async startCapture(): Promise<MediaStream> {
    if (!this._isInitialized || !this.captureContext) {
      throw new Error('LiveAudioManager not initialized. Call initialize() first.');
    }

    // If already capturing and stream is active, return existing stream
    if (this._isCaptureActive && this.mediaStream && this.mediaStream.active) {
      return this.mediaStream;
    }

    // If previous capture components exist, clean them up before acquiring new stream
    if (this._isCaptureActive) {
      this.stopCapture();
    }

    // Resume capture context if suspended (autoplay policy)
    if (this.captureContext.state === 'suspended') {
      await this.captureContext.resume();
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

    // Create source node from mic on isolated capture context
    this.sourceNode = this.captureContext.createMediaStreamSource(this.mediaStream);

    // Create capture worklet node
    this.captureNode = new AudioWorkletNode(this.captureContext, 'pcm-capture-processor');

    // Handle messages from capture processor
    this.captureNode.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'pcm') {
        this.config.onPcmData(e.data.data);
      } else if (e.data.type === 'amplitude') {
        this.config.onAmplitude?.(e.data.value);
      }
    };

    // Connect: mic → capture processor (never to destination)
    this.sourceNode.connect(this.captureNode);

    this._isCaptureActive = true;
    return this.mediaStream;
  }

  /**
   * Stop capturing microphone audio without destroying the context.
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
   * Start the playback pipeline. Feeds PCM via enqueuePcm().
   * On mobile, uses MediaStreamAudioDestinationNode + HTMLAudioElement to force loudspeaker.
   * On desktop, connects directly to destination for minimal latency.
   */
  startPlayback(): void {
    if (!this._isInitialized || !this.playbackContext) return;
    if (this.playbackNode) return; // Already started

    if (this.playbackContext.state === 'suspended') {
      this.playbackContext.resume().catch(() => {});
    }

    this.playbackNode = new AudioWorkletNode(this.playbackContext, 'pcm-playback-processor');

    this.playbackNode.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'playback-ended') {
        this.config.onPlaybackEnded?.();
      } else if (e.data.type === 'amplitude') {
        this.config.onAmplitude?.(e.data.value);
      }
    };

    // Create destination gain node to smoothly manage direct destination vs loudspeaker
    this.destinationGainNode = this.playbackContext.createGain();
    this.playbackNode.connect(this.destinationGainNode);
    this.destinationGainNode.connect(this.playbackContext.destination);

    const isMobile = typeof navigator !== 'undefined' && 
      /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');

    if (isMobile) {
      // In mobile loudspeaker mode, direct destination is initially muted to prevent earpiece bleed
      this.destinationGainNode.gain.value = 0;

      try {
        // Mobile route: Pipe worklet into a MediaStreamDestination and attach to an HTMLAudioElement.
        // This causes iOS and Android to classify playback through the loudspeaker media channel.
        this.playbackStreamDest = this.playbackContext.createMediaStreamDestination();
        this.playbackNode.connect(this.playbackStreamDest);

        if (!this.playbackAudioEl) {
          this.playbackAudioEl = new Audio();
          this.playbackAudioEl.setAttribute('playsinline', 'true');
          (this.playbackAudioEl as any).playsInline = true;
          this.playbackAudioEl.autoplay = true;
        }

        this.playbackAudioEl.srcObject = this.playbackStreamDest.stream;

        // Attempt to explicitly set output sink to loudspeaker if API is available
        this.routeToSpeaker(this.playbackAudioEl);

        this.playbackAudioEl.play().catch(err => {
          console.warn('[LiveAudio] HTMLAudioElement play rejected, activating destination fallback:', err);
          this._isDestinationFallback = true;
          if (this.destinationGainNode) {
            this.destinationGainNode.gain.value = 1;
          }
        });
      } catch (err) {
        console.warn('[LiveAudio] MediaStreamDestination setup failed, falling back to direct destination:', err);
        this._isDestinationFallback = true;
        if (this.destinationGainNode) {
          this.destinationGainNode.gain.value = 1;
        }
      }
    } else {
      // Desktop route: Direct connection to destination at full volume for sub-millisecond latency
      this.destinationGainNode.gain.value = 1;
      this.routeToSpeaker(this.playbackContext);
    }
  }

  /**
   * Helper to set audio output device to speaker if setSinkId is supported.
   */
  private async routeToSpeaker(target: AudioContext | HTMLAudioElement | null): Promise<void> {
    if (!target) return;
    try {
      if ('setSinkId' in target && typeof (target as any).setSinkId === 'function') {
        if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const speaker = devices.find(d =>
            d.kind === 'audiooutput' &&
            (d.label.toLowerCase().includes('speaker') || d.label.toLowerCase().includes('loudspeaker'))
          );
          if (speaker && speaker.deviceId) {
            await (target as any).setSinkId(speaker.deviceId);
            return;
          }
        }
        await (target as any).setSinkId('');
      }
    } catch (e) {
      console.debug('[LiveAudio] Output sink selection notice:', e);
    }
  }

  /**
   * Toggle between Loudspeaker (Hands-free) and Earpiece (Private call) on demand.
   */
  async setSpeakerphone(enabled: boolean): Promise<void> {
    this._isSpeakerphone = enabled;
    if (!this.playbackContext || !this.playbackNode) return;

    if (enabled) {
      // Switch to loudspeaker: Mute direct destination, unmute and activate loudspeaker audio element
      if (this.destinationGainNode) {
        this.destinationGainNode.gain.value = 0;
      }

      if (this.playbackAudioEl) {
        this.playbackAudioEl.muted = false;
        if (this.playbackAudioEl.paused) {
          await this.playbackAudioEl.play().catch(() => {});
        }
        await this.routeToSpeaker(this.playbackAudioEl);
      } else if (this.playbackStreamDest) {
        this.playbackAudioEl = new Audio();
        this.playbackAudioEl.setAttribute('playsinline', 'true');
        (this.playbackAudioEl as any).playsInline = true;
        this.playbackAudioEl.autoplay = true;
        this.playbackAudioEl.srcObject = this.playbackStreamDest.stream;
        await this.playbackAudioEl.play().catch(() => {});
        await this.routeToSpeaker(this.playbackAudioEl);
      } else {
        if (this.destinationGainNode) {
          this.destinationGainNode.gain.value = 1;
        }
        await this.routeToSpeaker(this.playbackContext);
      }
    } else {
      // Switch to earpiece / private handset mode: Mute loudspeaker audio element, activate direct destination
      if (this.playbackAudioEl) {
        this.playbackAudioEl.muted = true;
      }
      if (this.destinationGainNode) {
        this.destinationGainNode.gain.value = 1;
      }
    }
  }

  /**
   * Enqueue raw 24kHz 16-bit PCM data for playback.
   */
  enqueuePcm(pcmBuffer: ArrayBuffer): void {
    if (!this.playbackNode) return;

    // Guard against suspended contexts or paused audio elements on mobile
    if (this.playbackContext && this.playbackContext.state === 'suspended') {
      this.playbackContext.resume().catch(() => {});
    }
    if (!this._isDestinationFallback && this.playbackAudioEl && this.playbackAudioEl.paused) {
      this.playbackAudioEl.play().catch(() => {});
    }

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
   * Full cleanup — release all resources on both capture and playback pipelines.
   */
  destroy(): void {
    this.stopCapture();

    if (this.playbackNode) {
      this.playbackNode.port.postMessage({ type: 'stop' });
      this.playbackNode.disconnect();
      this.playbackNode = null;
    }

    if (this.destinationGainNode) {
      this.destinationGainNode.disconnect();
      this.destinationGainNode = null;
    }

    if (this.playbackStreamDest) {
      this.playbackStreamDest.disconnect();
      this.playbackStreamDest = null;
    }

    if (this.playbackAudioEl) {
      try {
        this.playbackAudioEl.pause();
        this.playbackAudioEl.srcObject = null;
      } catch (_) {}
      this.playbackAudioEl = null;
    }

    if (this.captureContext && this.captureContext.state !== 'closed') {
      this.captureContext.close().catch(() => {});
      this.captureContext = null;
    }

    if (this.playbackContext && this.playbackContext.state !== 'closed') {
      this.playbackContext.close().catch(() => {});
      this.playbackContext = null;
    }

    // Reset AudioSession on iOS if available
    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      try {
        (navigator as any).audioSession.type = 'auto';
      } catch (_) {}
    }

    this._isInitialized = false;
  }
}
