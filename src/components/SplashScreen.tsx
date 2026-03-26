/**
 * SplashScreen.tsx — Obsidian Void intro with breathing particles
 *
 * Flow:
 *   1. Particles converge from void → breathing lattice forms
 *   2. "SciVisualizer" caustic-reveals (blur → focus), no metallic sweep
 *   3. Breathing continues indefinitely, waiting for user
 *   4. On click: text dissolves into particles that scatter outward
 *      with the breathing field, then the whole layer fades to white seamlessly
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const BG_COLOR = '#0A0D14';
const BREATH_CYCLE = 0.0018;
const PARTICLE_COUNT_FACTOR = 0.00035;

// ─── Breathing Particle Canvas ───────────────────────────────────────────────

const BreathingCanvas: React.FC<{
  phase: 'intro' | 'steady' | 'scatter';
  onScatterDone?: () => void;
}> = ({ phase, onScatterDone }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let w = window.innerWidth;
    let h = window.innerHeight;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const cx = w / 2;
    const cy = h / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy);

    const count = Math.max(300, Math.floor(w * h * PARTICLE_COUNT_FACTOR));

    interface Particle {
      homeX: number; homeY: number;
      x: number; y: number;
      radius: number;
      phaseOffset: number;
      distFromCenter: number;
      baseLum: number;
      hue: number;
      // Scatter velocity
      scatterVx: number; scatterVy: number;
      scattered: boolean;
    }

    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.6) * maxDist * 0.85;
      const hx = cx + Math.cos(angle) * r;
      const hy = cy + Math.sin(angle) * r;

      particles.push({
        homeX: hx, homeY: hy,
        x: hx, y: hy,
        radius: 0.6 + Math.random() * 1.4,
        phaseOffset: Math.random() * Math.PI * 2,
        distFromCenter: r / maxDist,
        baseLum: 0.15 + Math.random() * 0.35,
        hue: Math.random() < 0.6 ? 0 : Math.random() < 0.7 ? 1 : 2,
        scatterVx: 0,
        scatterVy: 0,
        scattered: false,
      });
    }

    let t = 0;
    let globalAlpha = 0;
    let scatterT = 0;
    let notifiedDone = false;
    let frameId: number;

    const draw = () => {
      t += 1;
      const breath = Math.sin(t * BREATH_CYCLE);
      const currentPhase = phaseRef.current;

      // Fade in during intro
      if (currentPhase === 'intro' && globalAlpha < 1) {
        globalAlpha = Math.min(1, globalAlpha + 0.008);
      }

      // During scatter, track progress
      if (currentPhase === 'scatter') {
        scatterT += 1;
        // After scatter animation, notify parent
        if (scatterT > 90 && !notifiedDone) {
          notifiedDone = true;
          onScatterDone?.();
        }
      }

      // Clear
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, w, h);

      // Subtle core glow
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxDist * 0.7);
      coreGrad.addColorStop(0, `rgba(20, 18, 30, ${0.4 * globalAlpha})`);
      coreGrad.addColorStop(0.5, 'rgba(10, 13, 20, 0)');
      coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = coreGrad;
      ctx.fillRect(0, 0, w, h);

      // Draw connections (inner particles only)
      if (currentPhase !== 'scatter' || scatterT < 30) {
        ctx.lineWidth = 0.4;
        const connDist = 80;
        const connAlphaMultiplier = currentPhase === 'scatter'
          ? Math.max(0, 1 - scatterT / 30) : 1;

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (p.distFromCenter > 0.5) continue;
          for (let j = i + 1; j < Math.min(i + 40, particles.length); j++) {
            const q = particles[j];
            const dx = p.x - q.x;
            const dy = p.y - q.y;
            const d = dx * dx + dy * dy;
            if (d < connDist * connDist) {
              const dist = Math.sqrt(d);
              const lineA = (1 - dist / connDist) * 0.08 * globalAlpha
                * Math.min(p.baseLum, q.baseLum) * connAlphaMultiplier;
              ctx.strokeStyle = `rgba(100, 130, 200, ${lineA})`;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              ctx.stroke();
            }
          }
        }
      }

      // Update & draw particles
      for (const p of particles) {
        if (currentPhase === 'scatter') {
          // Initialize scatter velocity on first scatter frame
          if (!p.scattered) {
            p.scattered = true;
            const angle = Math.atan2(p.y - cy, p.x - cx) + (Math.random() - 0.5) * 0.5;
            const speed = 2 + Math.random() * 4 + (1 - p.distFromCenter) * 3;
            p.scatterVx = Math.cos(angle) * speed;
            p.scatterVy = Math.sin(angle) * speed;
          }
          // Apply scatter velocity with slight deceleration
          p.x += p.scatterVx;
          p.y += p.scatterVy;
          p.scatterVx *= 0.985;
          p.scatterVy *= 0.985;

          // Continue gentle breathing drift even while scattering
          p.x += Math.sin(t * 0.003 + p.phaseOffset) * 0.2;
          p.y += Math.cos(t * 0.002 + p.phaseOffset * 1.3) * 0.2;
        } else {
          // Normal breathing mode
          const breathScale = 1 + breath * 0.18 * (1 - p.distFromCenter * 0.3);
          const personalBreath = Math.sin(t * BREATH_CYCLE * 1.3 + p.phaseOffset) * 0.06;

          const dx = p.homeX - cx;
          const dy = p.homeY - cy;
          const targetX = cx + dx * (breathScale + personalBreath);
          const targetY = cy + dy * (breathScale + personalBreath);

          p.x += (targetX - p.x) * 0.04;
          p.y += (targetY - p.y) * 0.04;

          p.x += Math.sin(t * 0.003 + p.phaseOffset) * 0.3;
          p.y += Math.cos(t * 0.002 + p.phaseOffset * 1.3) * 0.3;
        }

        // Alpha: fade out during scatter
        const scatterFade = currentPhase === 'scatter'
          ? Math.max(0, 1 - scatterT / 80) : 1;

        const pulseLum = p.baseLum * (1 + breath * 0.4);
        const alpha = pulseLum * globalAlpha * scatterFade;

        if (alpha < 0.005) continue;

        let r: number, g: number, b: number;
        if (p.hue === 0) {
          r = 60 + pulseLum * 40; g = 80 + pulseLum * 60; b = 160 + pulseLum * 80;
        } else if (p.hue === 1) {
          r = 140 + pulseLum * 40; g = 150 + pulseLum * 30; b = 170 + pulseLum * 20;
        } else {
          r = 180 + pulseLum * 60; g = 150 + pulseLum * 30; b = 60 + pulseLum * 20;
        }

        // Glow
        const glowGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 4);
        glowGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.15})`);
        glowGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.8})`;
        ctx.fill();
      }

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
};

// ─── Main Splash ─────────────────────────────────────────────────────────────

const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [show, setShow] = useState(true);
  const [textReady, setTextReady] = useState(false);
  const [subtitleReady, setSubtitleReady] = useState(false);
  const [canvasPhase, setCanvasPhase] = useState<'intro' | 'steady' | 'scatter'>('intro');
  const [textDissolving, setTextDissolving] = useState(false);
  const [bgFading, setBgFading] = useState(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    const t1 = setTimeout(() => setTextReady(true), 600);
    const t2 = setTimeout(() => setSubtitleReady(true), 1600);
    const t3 = setTimeout(() => setCanvasPhase('steady'), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const handleScatterDone = useCallback(() => {
    // Particles scattered — start fading the entire splash layer
    setBgFading(true);
    // Give enough time for the opacity transition to complete
    setTimeout(() => {
      setShow(false);
      onComplete();
    }, 1200);
  }, [onComplete]);

  const handleClick = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;

    // 1. Dissolve text (letters scatter with blur)
    setTextDissolving(true);

    // 2. After a beat, trigger particle scatter
    setTimeout(() => {
      setCanvasPhase('scatter');
    }, 300);
  }, []);

  const brand = 'SciVisualizer';

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash"
          onClick={handleClick}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center cursor-pointer overflow-hidden select-none"
          style={{
            background: BG_COLOR,
            opacity: bgFading ? 0 : 1,
            transition: 'opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* Particle field */}
          <BreathingCanvas phase={canvasPhase} onScatterDone={handleScatterDone} />

          {/* Ambient occlusion vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse 70% 60% at 50% 50%, transparent 0%, ${BG_COLOR} 100%)`,
            }}
          />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center gap-5">

            {/* Brand title — caustic reveal, dissolve on exit */}
            <div className="flex items-baseline" aria-label="SciVisualizer">
              {brand.split('').map((char, i) => {
                const isSci = i < 3;
                const delay = i * 0.045;

                // Dissolve: each letter blurs out and drifts in a random direction
                const dissolveAngle = (i / brand.length) * Math.PI * 2 + Math.random() * 0.5;
                const dissolveDist = 40 + Math.random() * 60;

                return (
                  <motion.span
                    key={i}
                    initial={{
                      opacity: 0,
                      filter: 'blur(18px)',
                      scale: 1.15,
                      x: 0,
                      y: 0,
                    }}
                    animate={textDissolving ? {
                      opacity: 0,
                      filter: 'blur(12px)',
                      scale: 0.8,
                      x: Math.cos(dissolveAngle) * dissolveDist,
                      y: Math.sin(dissolveAngle) * dissolveDist,
                    } : textReady ? {
                      opacity: 1,
                      filter: 'blur(0px)',
                      scale: 1,
                      x: 0,
                      y: 0,
                    } : {}}
                    transition={textDissolving ? {
                      duration: 0.6,
                      delay: i * 0.02,
                      ease: 'easeIn',
                    } : {
                      duration: 0.7,
                      delay,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter"
                    style={{
                      display: 'inline-block',
                      color: isSci ? '#7A879E' : 'rgba(230, 232, 238, 0.95)',
                    }}
                  >
                    {char}
                  </motion.span>
                );
              })}
            </div>

            {/* Thin rule */}
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={textDissolving
                ? { scaleX: 0, opacity: 0 }
                : textReady
                  ? { scaleX: 1, opacity: 0.2 }
                  : {}
              }
              transition={{ duration: textDissolving ? 0.3 : 0.8, delay: textDissolving ? 0 : 0.5, ease: 'easeOut' }}
              className="w-48 h-px origin-center"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(160, 170, 190, 0.4), transparent)',
              }}
            />

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
              animate={textDissolving
                ? { opacity: 0, y: -10, filter: 'blur(8px)' }
                : subtitleReady
                  ? { opacity: 0.4, y: 0, filter: 'blur(0px)' }
                  : {}
              }
              transition={{ duration: textDissolving ? 0.4 : 0.7, ease: 'easeOut' }}
              className="text-xs md:text-sm font-mono tracking-[0.25em] uppercase"
              style={{ color: '#6B7280' }}
            >
              The Super Automation Foundation for Science
            </motion.p>

            {/* Scroll/click hint — mouse icon */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={textDissolving
                ? { opacity: 0, y: 10 }
                : subtitleReady
                  ? { opacity: 1, y: 0 }
                  : {}
              }
              transition={{ duration: 0.6, delay: textDissolving ? 0 : 1.2 }}
              className="mt-10 flex flex-col items-center gap-2"
            >
              <motion.div
                animate={{ y: [0, 3, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="w-5 h-8 rounded-full border border-gray-600/25 flex items-start justify-center pt-1.5"
              >
                <motion.div
                  animate={{ opacity: [0.5, 0.15, 0.5], y: [0, 6, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-0.5 h-1.5 rounded-full bg-gray-500/40"
                />
              </motion.div>
              <p className="text-[10px] font-mono text-gray-600/25 tracking-widest uppercase">
                Click to enter
              </p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
