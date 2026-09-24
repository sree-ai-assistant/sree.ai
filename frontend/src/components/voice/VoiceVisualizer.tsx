import React, { useEffect, useRef } from 'react';
import { audioGraph } from '../../lib/audio';

export type VisualizerState = 'connecting' | 'thinking' | 'active';

interface VoiceVisualizerProps {
  stream?: MediaStream | null;
  audioElement?: HTMLAudioElement | null;
  isActive: boolean;
  visualState?: VisualizerState;
  isGray?: boolean;
}

// Unified particle capable of continuous physical morphing between:
// 1. Waking Up (Small 2D Clockwise Ring)
// 2. Active / Speaking / Listening (3D Audio-reactive Sphere)
// 3. Thinking (Large Thick 2D Clockwise Ring, Images 4 & 5)
interface UniversalParticle {
  // --- 1. Small 2D Ring (Waking Up) ---
  smallRingAngle: number;
  smallRingRadiusOffset: number;

  // --- 2. Thinking Ring (Images 4 & 5) ---
  thinkingAngle: number;
  thinkingRadiusOffset: number; // Gaussian ±16px offset (~32px band thickness)
  thinkingSpeed: number; // Strictly positive clockwise advance
  driftPhase: number;
  driftSpeed: number;

  // --- 3. 3D Audio Sphere (Speaking / Listening) ---
  theta: number;
  phi: number;
  speedTheta: number;
  speedPhi: number;

  // --- 4. 3D Scatter Impulses for Smooth Physical Transitions ---
  scatterVx: number;
  scatterVy: number;
  scatterVz: number;
  scatterIntensity: number;

  // --- 5. Aesthetics & Twinkle ---
  baseHue: number;
  size: number;
  baseAlpha: number;
  sparkleSpeed: number;
  sparklePhase: number;
  hasGlow: boolean;
}

const easeInOutCubic = (t: number) => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({
  stream,
  audioElement,
  isActive,
  visualState = 'active',
  isGray = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  // Unified particle system for all states and transitions
  const particlesRef = useRef<UniversalParticle[]>([]);

  // Audio level smoothing
  const smoothedLevelRef = useRef(0);

  // State transitions & continuous morph progressions
  const stateRef = useRef({
    ringRotation: 0,
    sphereRotation: 0,
    // wakingMorph: 0.0 = small waking ring, 1.0 = normal visualizer scale
    wakingMorph: visualState === 'connecting' ? 0.0 : 1.0,
    // thinkingMorph: 0.0 = 3D speaking/listening sphere, 1.0 = thick clockwise thinking ring
    thinkingMorph: visualState === 'thinking' ? 1.0 : 0.0,
  });

  const visualStateRef = useRef<VisualizerState>(visualState);
  useEffect(() => {
    visualStateRef.current = visualState;
  }, [visualState]);

  // Initialize unified particles once
  useEffect(() => {
    const totalCount = 550;
    const particles: UniversalParticle[] = [];

    for (let i = 0; i < totalCount; i++) {
      // 1. Small Ring distribution
      const smallRingAngle = (i / totalCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.04;
      const smallRingRadiusOffset = (Math.random() - 0.5) * 8; // ±4px

      // 2. Thinking Ring distribution (Images 4 & 5: ~32px Gaussian band thickness)
      const thinkingAngle = Math.random() * Math.PI * 2;
      const uNorm = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // [-1, 1] bell curve
      const thinkingRadiusOffset = uNorm * 16; // ±16px radial offset
      const thinkingSpeed = 0.014 + (Math.random() - 0.5) * 0.006; // 0.011 to 0.017 rad/frame clockwise

      // 3. 3D Sphere spherical coordinates
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);

      // 4. Random 3D scatter unit vector for the blossom/burst effect
      const u = Math.random() * 2 - 1;
      const scatterAngle = Math.random() * Math.PI * 2;
      const sqrtU = Math.sqrt(Math.max(0, 1 - u * u));
      const scatterVx = sqrtU * Math.cos(scatterAngle);
      const scatterVy = sqrtU * Math.sin(scatterAngle);
      const scatterVz = u;
      const scatterIntensity = 0.22 + Math.random() * 0.40;

      particles.push({
        smallRingAngle,
        smallRingRadiusOffset,

        thinkingAngle,
        thinkingRadiusOffset,
        thinkingSpeed,
        driftPhase: Math.random() * Math.PI * 2,
        driftSpeed: Math.random() * 1.4 + 0.8,

        theta,
        phi,
        speedTheta: (Math.random() - 0.5) * 0.013,
        speedPhi: (Math.random() - 0.5) * 0.008,

        scatterVx,
        scatterVy,
        scatterVz,
        scatterIntensity,

        baseHue: 205 + Math.random() * 55, // Celestial blue-violet spectrum
        size: Math.random() * 1.5 + 0.8,
        baseAlpha: Math.random() * 0.45 + 0.55,
        sparkleSpeed: Math.random() * 2.0 + 1.0,
        sparklePhase: Math.random() * Math.PI * 2,
        hasGlow: Math.random() < 0.3,
      });
    }

    particlesRef.current = particles;
  }, []);

  // Canvas resize listener
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    handleResize();

    return () => resizeObserver.disconnect();
  }, []);

  // Main Animation and Audio Loop
  useEffect(() => {
    let active = true;

    const initAudio = async () => {
      try {
        let analyzer: AnalyserNode | null = null;

        if (stream || audioElement) {
          await audioGraph.resume();
          const ctx = audioGraph.getContext();
          const key = stream || audioElement!;
          const sourceNode = audioGraph.getSource(key);

          if (sourceNode) {
            analyzer = ctx.createAnalyser();
            analyzer.fftSize = 128;
            analyzer.smoothingTimeConstant = 0.8;
            analyzerRef.current = analyzer;
            sourceNode.connect(analyzer);
          }
        }

        const dataArray = analyzer ? new Uint8Array(analyzer.frequencyBinCount) : null;

        const draw = () => {
          if (!active || !canvasRef.current || !isActive) return;

          const canvas = canvasRef.current;
          const ctxCanvas = canvas.getContext('2d');
          if (!ctxCanvas) return;

          const dpr = window.devicePixelRatio || 1;
          const width = canvas.width / dpr;
          const height = canvas.height / dpr;
          const now = Date.now();

          const currentState = visualStateRef.current;
          const st = stateRef.current;

          // ─── 1. Continuous Morph State Progression ─────────────────────
          // Waking morph: 0.0 = small waking ring, 1.0 = normal scale
          if (currentState === 'connecting') {
            st.wakingMorph += (0.0 - st.wakingMorph) * 0.12;
          } else {
            // Transitions smoothly from waking ring to full scale (~1.1s)
            if (st.wakingMorph < 1.0) {
              st.wakingMorph = Math.min(1.0, st.wakingMorph + 0.016);
            }
          }

          // Thinking morph: 1.0 = thick clockwise thinking ring, 0.0 = speaking/listening sphere
          if (currentState === 'thinking') {
            // Transitions smoothly from sphere into thinking ring (~1.0s)
            if (st.thinkingMorph < 1.0) {
              st.thinkingMorph = Math.min(1.0, st.thinkingMorph + 0.016);
            }
          } else {
            // Transitions smoothly from thinking ring into speaking sphere (~1.0s)
            if (st.thinkingMorph > 0.0) {
              st.thinkingMorph = Math.max(0.0, st.thinkingMorph - 0.016);
            }
          }

          // Audio level
          let currentLevel = 0;
          if (currentState === 'active' && analyzer && dataArray) {
            analyzer.getByteFrequencyData(dataArray);
            const sum = dataArray.reduce((acc, val) => acc + val, 0);
            currentLevel = sum / dataArray.length / 255;
          } else {
            // Subtle idle breathing
            currentLevel = (Math.sin(now / 1000) + 1) * 0.02;
          }

          smoothedLevelRef.current += (currentLevel - smoothedLevelRef.current) * 0.15;
          const level = smoothedLevelRef.current;

          // Clear canvas
          ctxCanvas.clearRect(0, 0, width, height);
          ctxCanvas.save();
          ctxCanvas.translate(width / 2, height / 2);

          // ─── 2. Interpolation Curves & Radii ───────────────────────────
          const W = easeInOutCubic(st.wakingMorph);
          const T = easeInOutCubic(st.thinkingMorph);

          // Small ring rotation (clockwise)
          st.ringRotation += 0.016;
          // 3D Sphere rotation
          st.sphereRotation += 0.002 + level * 0.012;

          // Radii
          const smallRadius = Math.min(width, height) * 0.11;
          const activeBaseRadius = Math.min(width, height) * 0.20;
          const thinkingRadius = Math.min(width, height) * 0.21;

          // Radius scaling for 3D sphere based on audio
          const dynamicRadius = activeBaseRadius * (1 + level * 3.8);

          // Inner sphere glow: only visible in 3D sphere mode (active speaking/listening)
          // Completely hidden during connecting AND thinking so the center is 100% hollow
          const sphereInfluence = W * (1 - T);
          if (sphereInfluence > 0.05) {
            const glowAlpha = (0.03 + level * 0.15) * sphereInfluence;
            const glowGrade = ctxCanvas.createRadialGradient(0, 0, 0, 0, 0, dynamicRadius);
            const glowHue = isGray ? 0 : 215;
            const glowSat = isGray ? '0%' : '100%';
            glowGrade.addColorStop(0, `hsla(${glowHue}, ${glowSat}, 65%, ${glowAlpha})`);
            glowGrade.addColorStop(1, 'transparent');
            ctxCanvas.fillStyle = glowGrade;
            ctxCanvas.beginPath();
            ctxCanvas.arc(0, 0, dynamicRadius * 1.8, 0, Math.PI * 2);
            ctxCanvas.fill();
          }

          // ─── 3. Scatter Impulses for Transitions ───────────────────────
          // Scatter curve peaks at 0.5 during any morph transition
          const scatterWaking = Math.sin(st.wakingMorph * Math.PI);
          const scatterThinking = Math.sin(st.thinkingMorph * Math.PI);

          // ─── 4. Particle Rendering & Transformation ───────────────────
          particlesRef.current.forEach((p) => {
            // (A) Coordinates on Small Ring (Waking Up)
            const ringAngle = p.smallRingAngle + st.ringRotation;
            const rSmall = smallRadius + p.smallRingRadiusOffset;
            const xSmall = rSmall * Math.cos(ringAngle);
            const ySmall = rSmall * Math.sin(ringAngle);
            const zSmall = 0;

            // (B) Coordinates on 3D Sphere (Speaking / Listening)
            p.theta += p.speedTheta;
            p.phi += p.speedPhi;
            const xSphere = dynamicRadius * Math.sin(p.phi) * Math.cos(p.theta + st.sphereRotation);
            const ySphere = dynamicRadius * Math.sin(p.phi) * Math.sin(p.theta + st.sphereRotation);
            const zSphere = dynamicRadius * Math.cos(p.phi);

            // (C) Coordinates on Thinking Ring (Large Thick Clockwise Ring, Images 4 & 5)
            p.thinkingAngle = (p.thinkingAngle + p.thinkingSpeed) % (Math.PI * 2);
            const radialWave = Math.sin(p.thinkingAngle * 2 + now * 0.0018 * p.driftSpeed + p.driftPhase) * 1.8;
            const rThinking = thinkingRadius + p.thinkingRadiusOffset + radialWave;
            const xThinking = rThinking * Math.cos(p.thinkingAngle);
            const yThinking = rThinking * Math.sin(p.thinkingAngle);
            const zThinking = 0;

            // (D) Step 1: Blend Waking Up Ring <-> 3D Sphere with 3D scatter burst
            const scatterDistW = activeBaseRadius * p.scatterIntensity * scatterWaking;
            const sxW = p.scatterVx * scatterDistW;
            const syW = p.scatterVy * scatterDistW;
            const szW = p.scatterVz * scatterDistW;

            const xWS = (1 - W) * xSmall + W * xSphere + sxW;
            const yWS = (1 - W) * ySmall + W * ySphere + syW;
            const zWS = (1 - W) * zSmall + W * zSphere + szW;

            // (E) Step 2: Blend 3D Sphere <-> Thinking Ring with 3D scatter burst
            // When transitioning Thinking -> Speaking, particles scatter outwards in 3D and blossom into the sphere!
            const scatterDistT = activeBaseRadius * p.scatterIntensity * scatterThinking;
            const sxT = p.scatterVx * scatterDistT;
            const syT = p.scatterVy * scatterDistT;
            const szT = p.scatterVz * scatterDistT;

            const x = (1 - T) * xWS + T * xThinking + sxT;
            const y = (1 - T) * yWS + T * yThinking + syT;
            const z = (1 - T) * zWS + T * zThinking + szT;

            // (F) 3D Perspective Projection
            const perspective = 500;
            const scale = perspective / (perspective + z);
            const px = x * scale;
            const py = y * scale;

            // (G) Twinkle & Depth Opacity
            const sparkle = Math.sin(now * 0.0035 * p.sparkleSpeed + p.sparklePhase) * 0.5 + 0.5;
            const whiteAlpha = (0.38 + 0.62 * sparkle) * p.baseAlpha;

            const zFactor = (z + dynamicRadius) / (dynamicRadius * 2);
            const sphereAlpha = 0.25 + Math.max(0, Math.min(1, zFactor)) * 0.75;

            // Opacity blends between 2D ring sparkle and 3D depth opacity
            const alpha = whiteAlpha * (1 - sphereInfluence) + sphereAlpha * sphereInfluence;

            // Particle size: scales with 3D perspective and speech level
            const particleSize = p.size * (scale * sphereInfluence + (1 - sphereInfluence)) * (1 + level * 1.4 * sphereInfluence);

            // (H) Dynamic Color Blending:
            // - When in Thinking Ring or Waking Ring: Pure crystalline sparkling white (saturation 0%, lightness 95%)
            // - When in 3D Speaking/Listening Sphere: Rich celestial violet/blue (saturation 85%, lightness 75%)
            // - During morph: Smooth color bloom across the particles
            const targetHue = isGray ? 0 : ((p.baseHue + level * 30) % 360);
            const sat = isGray ? 0 : Math.round(85 * sphereInfluence);
            const light = Math.round(95 * (1 - sphereInfluence) + 75 * sphereInfluence);

            ctxCanvas.fillStyle = `hsla(${targetHue}, ${sat}%, ${light}%, ${alpha})`;

            // (I) Glow & Bloom
            if (sphereInfluence < 0.3) {
              // Pure white starlight bloom for ring particles
              if (p.hasGlow && sparkle > 0.6) {
                ctxCanvas.shadowBlur = p.size * 2.8;
                ctxCanvas.shadowColor = 'rgba(255, 255, 255, 0.85)';
              } else {
                ctxCanvas.shadowBlur = 0;
              }
            } else {
              // Luminous colored bloom for front particles during speech
              const isFront = z < 0;
              if (isFront && !isGray && (level > 0.05 || scatterThinking > 0.1)) {
                ctxCanvas.shadowBlur = particleSize * 3;
                ctxCanvas.shadowColor = `hsla(${targetHue}, 85%, 75%, 0.45)`;
              } else {
                ctxCanvas.shadowBlur = 0;
              }
            }

            ctxCanvas.beginPath();
            ctxCanvas.arc(px, py, Math.max(0.5, particleSize), 0, Math.PI * 2);
            ctxCanvas.fill();
          });

          ctxCanvas.restore();
          animationRef.current = requestAnimationFrame(draw);
        };

        draw();
      } catch (err) {
        console.error('Audio Visualizer error:', err);
      }
    };

    initAudio();

    return () => {
      active = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (analyzerRef.current) {
        try {
          const key = stream || audioElement!;
          const sourceNode = audioGraph.getSource(key);
          if (sourceNode) sourceNode.disconnect(analyzerRef.current);
        } catch (e) { }
      }
      analyzerRef.current = null;
    };
  }, [isActive, stream, audioElement, isGray]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          opacity: isActive ? (isGray ? 0.4 : 1) : 0,
          transition: 'opacity 0.8s ease-in-out',
        }}
      />
    </div>
  );
};
