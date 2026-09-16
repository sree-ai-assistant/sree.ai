/**
 * PCM AudioWorklet Processors for Gemini Live API
 * 
 * Two processors:
 * 1. PcmCaptureProcessor — Captures mic audio, downsamples to 16kHz, outputs 16-bit PCM
 * 2. PcmPlaybackProcessor — Receives 24kHz 16-bit PCM, upsamples to device rate, plays through speakers
 * 
 * Audio Format Requirements (Gemini Live API):
 *   Input:  16kHz, mono, 16-bit PCM, little-endian
 *   Output: 24kHz, mono, 16-bit PCM, little-endian
 */

// ─── Capture Processor ──────────────────────────────────────────────
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 4096; // Accumulate samples before sending
    this._buffer = new Float32Array(this._bufferSize);
    this._bufferIndex = 0;
    this._targetRate = 16000;
    this._active = true;

    this.port.onmessage = (e) => {
      if (e.data.type === 'stop') {
        this._active = false;
      }
    };
  }

  process(inputs) {
    if (!this._active) return false;

    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // Mono channel

    // Accumulate samples
    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._bufferIndex++] = channelData[i];

      if (this._bufferIndex >= this._bufferSize) {
        // Downsample from sampleRate to 16kHz
        const ratio = sampleRate / this._targetRate;
        const outputLength = Math.floor(this._bufferSize / ratio);
        const pcm16 = new Int16Array(outputLength);

        for (let j = 0; j < outputLength; j++) {
          const srcIndex = Math.floor(j * ratio);
          // Clamp float [-1, 1] to int16 range
          const sample = Math.max(-1, Math.min(1, this._buffer[srcIndex]));
          pcm16[j] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }

        // Send PCM data to main thread
        this.port.postMessage(
          { type: 'pcm', data: pcm16.buffer },
          [pcm16.buffer]
        );

        // Also send amplitude for visualizer
        let sum = 0;
        for (let j = 0; j < this._bufferSize; j++) {
          sum += Math.abs(this._buffer[j]);
        }
        this.port.postMessage({
          type: 'amplitude',
          value: sum / this._bufferSize
        });

        this._bufferIndex = 0;
        this._buffer = new Float32Array(this._bufferSize);
      }
    }

    return true;
  }
}

// ─── Playback Processor ─────────────────────────────────────────────
class PcmPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._queue = []; // Queue of Float32Array chunks
    this._currentChunk = null;
    this._currentOffset = 0;
    this._sourceRate = 24000;
    this._active = true;
    this._playing = false;

    this.port.onmessage = (e) => {
      if (e.data.type === 'pcm') {
        // Convert incoming Int16 PCM to Float32
        const int16 = new Int16Array(e.data.data);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF);
        }
        this._queue.push(float32);
        this._playing = true;
      } else if (e.data.type === 'clear') {
        this._queue = [];
        this._currentChunk = null;
        this._currentOffset = 0;
        this._playing = false;
      } else if (e.data.type === 'stop') {
        this._active = false;
      }
    };
  }

  process(inputs, outputs) {
    if (!this._active) return false;

    const output = outputs[0];
    if (!output || !output[0]) return true;

    const outputChannel = output[0];
    const ratio = this._sourceRate / sampleRate; // Conversion ratio

    for (let i = 0; i < outputChannel.length; i++) {
      // Get next sample from queue
      if (!this._currentChunk || this._currentOffset >= this._currentChunk.length) {
        if (this._queue.length > 0) {
          this._currentChunk = this._queue.shift();
          this._currentOffset = 0;
        } else {
          // No data available — output silence
          outputChannel[i] = 0;
          if (this._playing) {
            this._playing = false;
            this.port.postMessage({ type: 'playback-ended' });
          }
          continue;
        }
      }

      // Simple linear interpolation for sample rate conversion
      const srcIndex = this._currentOffset;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, this._currentChunk.length - 1);
      const frac = srcIndex - srcIndexFloor;

      outputChannel[i] = this._currentChunk[srcIndexFloor] * (1 - frac) +
                          this._currentChunk[srcIndexCeil] * frac;

      this._currentOffset += ratio;

      // Send amplitude for visualizer
      if (i === 0 && this._currentChunk) {
        this.port.postMessage({
          type: 'amplitude',
          value: Math.abs(outputChannel[i])
        });
      }
    }

    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
registerProcessor('pcm-playback-processor', PcmPlaybackProcessor);
