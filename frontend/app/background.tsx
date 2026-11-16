"use client";

import { useEffect, useRef } from "react";

// Animated farm scene: sun, clouds, birds, a distant tractor with dust,
// a sprinkler watering, vapor rising from evaporation, swaying wheat
// and a person walking with a hoe. Colors taken from the theme.
// With "reduce motion" it draws a single frame.

type Pal = { paper: string; paperDeep: string; mossWash: string; moss: string; mossDeep: string; clay: string; field: string; ink: string };

const WATER = "#7fa3a8";

function readPal(): Pal {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    paper: v("--paper", "#f3eddd"),
    paperDeep: v("--paper-deep", "#e9e1cc"),
    mossWash: v("--moss-wash", "#e2e6cf"),
    moss: v("--moss", "#3f6b3a"),
    mossDeep: v("--moss-deep", "#2c4d29"),
    clay: v("--clay", "#9a4220"),
    field: v("--field", "#8a8470"),
    ink: v("--ink", "#23301f"),
  };
}

type Vapor = { x: number; y: number; r: number; life: number };
type Cloud = { x: number; y: number; s: number; v: number };
type Bird = { x: number; y: number; v: number; s: number };

export function AnimatedBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const c = ctx;
    const pal = readPal();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let horizon = 0;
    let clouds: Cloud[] = [];
    let birds: Bird[] = [];
    let vapor: Vapor[] = [];
    let dust: Vapor[] = [];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = Math.max(1, Math.floor(w * dpr));
      canvas!.height = Math.max(1, Math.floor(h * dpr));
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      horizon = Math.max(h * 0.5, h - window.innerHeight * 0.36);
      clouds = Array.from({ length: 5 }, (_, i) => ({
        x: (i / 5) * w + Math.random() * 120,
        y: h * (0.08 + Math.random() * 0.22),
        s: 0.7 + Math.random() * 0.8,
        v: 0.012 + Math.random() * 0.02,
      }));
      birds = Array.from({ length: 4 }, () => ({
        x: Math.random() * w,
        y: h * (0.12 + Math.random() * 0.2),
        v: 0.03 + Math.random() * 0.03,
        s: 0.8 + Math.random() * 0.6,
      }));
    }

    function sky() {
      const g = c.createLinearGradient(0, 0, 0, horizon);
      g.addColorStop(0, pal.paper);
      g.addColorStop(1, pal.mossWash);
      c.fillStyle = g;
      c.fillRect(0, 0, w, horizon + 2);
    }

    function sun(t: number) {
      const cx = w * (0.8 + Math.sin(t * 0.00004) * 0.03);
      const cy = h * 0.14;
      const r = Math.max(w, h) * 0.35;
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, pal.clay);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.globalAlpha = 0.14;
      c.fillStyle = g;
      c.fillRect(0, 0, w, horizon);
      c.globalAlpha = 0.5;
      c.beginPath();
      c.arc(cx, cy, 14, 0, Math.PI * 2);
      c.fillStyle = pal.clay;
      c.fill();
      c.globalAlpha = 1;
    }

    function cloudShape(x: number, y: number, s: number) {
      c.beginPath();
      c.ellipse(x, y, 46 * s, 14 * s, 0, 0, Math.PI * 2);
      c.ellipse(x - 26 * s, y + 4 * s, 26 * s, 12 * s, 0, 0, Math.PI * 2);
      c.ellipse(x + 24 * s, y + 3 * s, 30 * s, 13 * s, 0, 0, Math.PI * 2);
      c.fill();
    }

    function drawClouds(step: boolean) {
      c.fillStyle = pal.paperDeep;
      c.globalAlpha = 0.85;
      for (const cl of clouds) {
        if (step) cl.x += cl.v;
        if (cl.x > w + 120) cl.x = -120;
        cloudShape(cl.x, cl.y, cl.s);
      }
      c.globalAlpha = 1;
    }

    function drawBirds(t: number, step: boolean) {
      c.strokeStyle = pal.ink;
      c.lineWidth = 1.3;
      c.globalAlpha = 0.45;
      for (const b of birds) {
        if (step) b.x += b.v;
        if (b.x > w + 20) b.x = -20;
        const flap = Math.sin(t * 0.008 + b.x) * 3 * b.s;
        c.beginPath();
        c.moveTo(b.x - 7 * b.s, b.y - flap);
        c.quadraticCurveTo(b.x - 3 * b.s, b.y + 1, b.x, b.y);
        c.quadraticCurveTo(b.x + 3 * b.s, b.y + 1, b.x + 7 * b.s, b.y - flap);
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    function hills() {
      const layers: { amp: number; base: number; phase: number; color: string; alpha: number }[] = [
        { amp: 22, base: horizon - 30, phase: 0.6, color: pal.moss, alpha: 0.28 },
        { amp: 16, base: horizon - 12, phase: 2.1, color: pal.mossDeep, alpha: 0.4 },
      ];
      for (const L of layers) {
        c.beginPath();
        c.moveTo(0, h);
        for (let x = 0; x <= w + 8; x += 8) {
          const y = L.base + Math.sin(x * 0.006 + L.phase) * L.amp + Math.sin(x * 0.017 + L.phase * 2) * (L.amp * 0.3);
          c.lineTo(x, y);
        }
        c.lineTo(w, h);
        c.closePath();
        c.fillStyle = L.color;
        c.globalAlpha = L.alpha;
        c.fill();
      }
      c.globalAlpha = 1;
    }

    function tractor(t: number, step: boolean) {
      // Moves slowly along the horizon, leaving dust.
      const span = w + 160;
      const x = ((t * 0.012) % span) - 80;
      const y = horizon - 4;
      if (step && Math.random() < 0.6) dust.push({ x: x - 12, y: y - 2, r: 2, life: 1 });
      c.fillStyle = pal.ink;
      c.globalAlpha = 0.55;
      c.fillRect(x - 9, y - 9, 16, 7);
      c.fillRect(x + 4, y - 13, 6, 11);
      c.beginPath();
      c.arc(x - 6, y - 1, 3.2, 0, Math.PI * 2);
      c.arc(x + 8, y - 1, 2.2, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }

    function fields() {
      // Strips of plowed land receding in perspective.
      c.fillStyle = pal.paperDeep;
      c.globalAlpha = 0.55;
      c.fillRect(0, horizon, w, h - horizon);
      c.globalAlpha = 0.5;
      for (let i = 0; i < 9; i++) {
        const y = horizon + (h - horizon) * Math.pow(i / 9, 1.6);
        const band = (h - horizon) * 0.04 * (1 + i * 0.25);
        c.fillStyle = i % 2 ? pal.field : pal.moss;
        c.globalAlpha = i % 2 ? 0.25 : 0.22;
        c.fillRect(0, y, w, band);
      }
      c.globalAlpha = 1;
    }

    function sprinkler(t: number) {
      // Center-pivot irrigation with an arc of drops; the soil under the arc looks wet.
      const px = w * 0.3;
      const py = horizon + (h - horizon) * 0.2;
      const reach = w * 0.22;
      c.strokeStyle = pal.ink;
      c.lineWidth = 2;
      c.globalAlpha = 0.5;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(px, py - 16);
      c.stroke();
      c.globalAlpha = 0.09;
      c.fillStyle = WATER;
      c.beginPath();
      c.ellipse(px + reach * 0.5, py + 4, reach * 0.6, 10, 0, 0, Math.PI * 2);
      c.fill();
      const N = 36;
      c.fillStyle = WATER;
      for (let i = 0; i < N; i++) {
        const p = (t * 0.00045 + i / N) % 1;
        const x = px + p * reach;
        const y = py - 16 - Math.sin(p * Math.PI) * 26 + p * 14;
        c.globalAlpha = 0.6 * (1 - p * 0.6);
        c.beginPath();
        c.arc(x, y, 2, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }

    function evaporation(step: boolean) {
      // Vapor rising from the wet soil and fading away.
      if (step && Math.random() < 0.25) {
        vapor.push({ x: w * 0.3 + (Math.random() - 0.5) * w * 0.2, y: horizon + (h - horizon) * 0.3, r: 3, life: 1 });
      }
      c.fillStyle = WATER;
      vapor = vapor.filter((p) => p.life > 0);
      for (const p of vapor) {
        if (step) {
          p.y -= 0.35;
          p.x += Math.sin(p.life * 10) * 0.2;
          p.r += 0.05;
          p.life -= 0.008;
        }
        c.globalAlpha = Math.max(0, p.life) * 0.35;
        c.beginPath();
        c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
      dust = dust.filter((p) => p.life > 0);
      c.fillStyle = pal.field;
      for (const p of dust) {
        if (step) {
          p.y -= 0.12;
          p.r += 0.06;
          p.life -= 0.012;
        }
        c.globalAlpha = Math.max(0, p.life) * 0.25;
        c.beginPath();
        c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }

    function wheat(t: number) {
      // Rows of wheat in the foreground, swaying in the wind.
      c.strokeStyle = pal.moss;
      c.lineWidth = 1.2;
      for (let row = 0; row < 4; row++) {
        const baseY = horizon + (h - horizon) * (0.55 + row * 0.13);
        const len = 14 + row * 5;
        c.globalAlpha = 0.45 + row * 0.12;
        c.beginPath();
        for (let x = -4; x < w + 6; x += 9) {
          const sway = Math.sin(t * 0.0022 + x * 0.02 + row) * (2 + row * 0.6);
          c.moveTo(x, baseY);
          c.lineTo(x + sway, baseY - len);
        }
        c.stroke();
        c.fillStyle = pal.moss;
        c.beginPath();
        for (let x = -4; x < w + 6; x += 9) {
          const sway = Math.sin(t * 0.0022 + x * 0.02 + row) * (2 + row * 0.6);
          c.ellipse(x + sway, baseY - len - 2, 1.6, 3.2, sway * 0.04, 0, Math.PI * 2);
        }
        c.fill();
      }
      c.globalAlpha = 1;
    }

    function farmer(t: number, x0: number, gy0: number, k: number, dir: number) {
      // Farmer walking with a hoe, looping horizontally.
      c.save();
      const span = w + 120;
      const raw = ((t * 0.01 * k + x0) % span) - 60;
      c.translate(dir > 0 ? raw : w - raw, gy0);
      c.scale(k * dir, k);
      const x = 0;
      const gy = 0;
      const step = Math.sin(t * 0.009);
      const bob = Math.abs(step) * 1.5;
      const ink = pal.ink;
      c.strokeStyle = ink;
      c.fillStyle = ink;
      c.lineWidth = 2.4;
      c.lineCap = "round";
      c.globalAlpha = 0.85;
      // Legs
      c.beginPath();
      c.moveTo(x, gy - 14 - bob);
      c.lineTo(x - step * 6, gy);
      c.moveTo(x, gy - 14 - bob);
      c.lineTo(x + step * 6, gy);
      c.stroke();
      // Torso
      c.beginPath();
      c.moveTo(x, gy - 14 - bob);
      c.lineTo(x + 1, gy - 30 - bob);
      c.stroke();
      // Hat and head
      c.beginPath();
      c.arc(x + 1, gy - 36 - bob, 4, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(x + 1, gy - 39 - bob, 8, 1.6, 0, 0, Math.PI * 2);
      c.fill();
      // Arm and hoe
      c.beginPath();
      c.moveTo(x + 1, gy - 27 - bob);
      c.lineTo(x + 8 + step * 2, gy - 18);
      c.stroke();
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(x + 8 + step * 2, gy - 18);
      c.lineTo(x + 16, gy - 2);
      c.stroke();
      c.beginPath();
      c.moveTo(x + 14, gy - 3);
      c.lineTo(x + 20, gy - 1);
      c.stroke();
      c.restore();
      c.globalAlpha = 1;
      c.lineCap = "butt";
    }

    function scene(t: number, step: boolean) {
      c.clearRect(0, 0, w, h);
      sky();
      sun(t);
      drawClouds(step);
      drawBirds(t, step);
      hills();
      tractor(t, step);
      fields();
      sprinkler(t);
      evaporation(step);
      farmer(t, w * 0.5, horizon + (h - horizon) * 0.32, 1.1, -1);
      wheat(t);
      farmer(t, 0, horizon + (h - horizon) * 0.55 + 4, 1.7, 1);
    }

    let raf = 0;
    function loop(t: number) {
      scene(t, true);
      raf = requestAnimationFrame(loop);
    }

    resize();
    if (reduce) {
      scene(0, false);
    } else {
      raf = requestAnimationFrame(loop);
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) scene(0, false);
    });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
