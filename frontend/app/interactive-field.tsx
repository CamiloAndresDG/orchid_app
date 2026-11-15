"use client";

import { useEffect, useRef, useState } from "react";

// Campo interactivo para el fondo del inicio de sesión.
// - Sembrar: tocar o arrastrar sobre la tierra planta trigo, maíz o girasoles que crecen.
// - Lluvia: tocar crea una nube que llueve; el agua hace crecer lo sembrado.
// - Los agricultores se pueden arrastrar a otro lugar del campo.
// - Al cambiar entre modo claro y oscuro, el sol se pone por la derecha y la luna sale por la izquierda (o al revés).

type Tool = "plant" | "rain";
type Kind = "wheat" | "corn" | "sunflower";
type Plant = { nx: number; nf: number; g: number; kind: Kind; born: number };
type Farmer = { nx: number; nf: number; dir: number; speed: number; phase: number; drag: boolean; hat: string; shirt: string };
type Cloud = { x: number; y: number; s: number; v: number; rain: number; alpha: number };
type Drop = { x: number; y: number; vy: number; ty: number };
type Ring = { x: number; y: number; r: number; life: number };
type Star = { nx: number; ny: number; r: number; tw: number };
type Bird = { x: number; y: number; v: number; vy: number; s: number };
type Shooting = { x: number; y: number; vx: number; vy: number; life: number };
type Fly = { nx: number; nf: number; ph: number };

const DAY = {
  skyTop: "#efe6cf",
  skyBottom: "#e2e6cf",
  hillFar: "#b9c7a3",
  hillNear: "#8fa57e",
  field: "#d9cfb2",
  stripe: "#c3cea6",
  crop: "#3f6b3a",
  cropDark: "#2c4d29",
  ear: "#c9a24a",
  petal: "#e0a93a",
  cob: "#d6aa45",
  ink: "#23301f",
  cloud: "#f8f3e6",
  water: "#6f97a1",
};
const NIGHT: typeof DAY = {
  skyTop: "#0a1418",
  skyBottom: "#1c2b26",
  hillFar: "#1f2e25",
  hillNear: "#16221a",
  field: "#192119",
  stripe: "#1e2a1c",
  crop: "#5c8a50",
  cropDark: "#36552f",
  ear: "#8f7a3c",
  petal: "#9a7a33",
  cob: "#8c7535",
  ink: "#0b110b",
  cloud: "#2b3833",
  water: "#9fc3c9",
};
type Pal = typeof DAY;

function rgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  const k = Math.min(1, Math.max(0, t));
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
}
function palette(t: number): Pal {
  const out = {} as Pal;
  for (const k of Object.keys(DAY) as (keyof Pal)[]) out[k] = mix(DAY[k], NIGHT[k], t);
  return out;
}
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const KINDS: Kind[] = ["wheat", "corn", "sunflower"];

export function InteractiveField() {
  const ref = useRef<HTMLCanvasElement>(null);
  const toolRef = useRef<Tool>("plant");
  const api = useRef<{ clear: () => void } | null>(null);
  const [tool, setTool] = useState<Tool>("plant");
  const [night, setNight] = useState(false);

  // Tema guardado: se aplica antes de que arranque el canvas para no animar al cargar.
  useEffect(() => {
    let dark = false;
    try {
      dark = localStorage.getItem("theme") === "dark";
    } catch {}
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNight(dark);
  }, []);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  function toggleTheme() {
    const next = !night;
    setNight(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const c = ctx;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let horizon = 0;
    let now = performance.now();

    // Día/noche con transición suave.
    const isDark = () => document.documentElement.dataset.theme === "dark";
    let night = isDark() ? 1 : 0;
    let from = night;
    let to = night;
    let start = 0;
    const DUR = reduce ? 1 : 2600;
    const mo = new MutationObserver(() => {
      const target = isDark() ? 1 : 0;
      if (target !== to) {
        from = night;
        to = target;
        start = performance.now();
      }
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const plants: Plant[] = [];
    for (let i = 0; i < 16; i++) {
      plants.push({ nx: rnd(0.03, 0.97), nf: rnd(0.15, 0.95), g: rnd(0.35, 1), kind: KINDS[i % 3], born: -1000 });
    }
    const farmers: Farmer[] = [
      { nx: 0.18, nf: 0.55, dir: 1, speed: 0.00022, phase: 0, drag: false, hat: "#c9a24a", shirt: "#3f6b3a" },
      { nx: 0.78, nf: 0.3, dir: -1, speed: 0.00016, phase: 2, drag: false, hat: "#9a4220", shirt: "#5b6b7a" },
      { nx: 0.5, nf: 0.85, dir: 1, speed: 0.00019, phase: 4, drag: false, hat: "#e0c27a", shirt: "#8a5a3a" },
    ];
    const clouds: Cloud[] = Array.from({ length: 5 }, (_, i) => ({
      x: (i / 5) * 1600 + rnd(0, 120),
      y: 0,
      s: rnd(0.7, 1.4),
      v: rnd(0.08, 0.18),
      rain: 0,
      alpha: 1,
    }));
    const cloudY = clouds.map(() => rnd(0.06, 0.3));
    let drops: Drop[] = [];
    let rings: Ring[] = [];
    let birds: Bird[] = Array.from({ length: 3 }, () => ({ x: rnd(0, 1600), y: rnd(60, 200), v: rnd(0.4, 0.7), vy: 0, s: rnd(0.8, 1.2) }));
    let shooting: Shooting[] = [];
    const stars: Star[] = Array.from({ length: 140 }, () => ({ nx: Math.random(), ny: Math.random() * 0.9, r: rnd(0.4, 1.5), tw: rnd(0.5, 2) }));
    const flies: Fly[] = Array.from({ length: 26 }, () => ({ nx: Math.random(), nf: rnd(0.05, 0.9), ph: rnd(0, 6.28) }));

    api.current = {
      clear() {
        plants.length = 0;
      },
    };

    const fieldY = (nf: number) => horizon + nf * (h - horizon);
    const depth = (nf: number) => 0.55 + nf * 0.85;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = Math.max(1, Math.floor(w * dpr));
      canvas!.height = Math.max(1, Math.floor(h * dpr));
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      horizon = h * 0.6;
      clouds.forEach((cl, i) => {
        if (!cl.rain) cl.y = h * cloudY[i];
      });
    }

    // --- Dibujo ---------------------------------------------------------

    function cloudShape(x: number, y: number, s: number) {
      c.beginPath();
      c.ellipse(x, y, 50 * s, 15 * s, 0, 0, Math.PI * 2);
      c.ellipse(x - 28 * s, y + 5 * s, 28 * s, 13 * s, 0, 0, Math.PI * 2);
      c.ellipse(x + 26 * s, y + 4 * s, 32 * s, 14 * s, 0, 0, Math.PI * 2);
      c.ellipse(x + 4 * s, y - 9 * s, 26 * s, 14 * s, 0, 0, Math.PI * 2);
      c.fill();
    }

    function sky(p: Pal) {
      const g = c.createLinearGradient(0, 0, 0, horizon);
      g.addColorStop(0, p.skyTop);
      g.addColorStop(1, p.skyBottom);
      c.fillStyle = g;
      c.fillRect(0, 0, w, horizon + 2);
      // Atardecer: un resplandor cálido en el horizonte a mitad de la transición.
      const dusk = Math.sin(Math.PI * night);
      if (dusk > 0.01) {
        const sg = c.createLinearGradient(0, horizon * 0.35, 0, horizon);
        sg.addColorStop(0, "rgba(229,154,92,0)");
        sg.addColorStop(1, `rgba(229,140,82,${0.55 * dusk})`);
        c.fillStyle = sg;
        c.fillRect(0, 0, w, horizon);
      }
    }

    function starsAndMeteors() {
      if (night < 0.02) return;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const tw = 0.55 + 0.45 * Math.sin(now * 0.0015 * s.tw + i);
        c.globalAlpha = night * tw;
        c.fillStyle = "#f4efd9";
        c.beginPath();
        c.arc(s.nx * w, s.ny * horizon, s.r, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
      shooting = shooting.filter((m) => m.life > 0);
      for (const m of shooting) {
        m.x += m.vx;
        m.y += m.vy;
        m.life -= 0.02;
        const g = c.createLinearGradient(m.x, m.y, m.x - m.vx * 14, m.y - m.vy * 14);
        g.addColorStop(0, `rgba(255,248,225,${m.life * night})`);
        g.addColorStop(1, "rgba(255,248,225,0)");
        c.strokeStyle = g;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(m.x, m.y);
        c.lineTo(m.x - m.vx * 14, m.y - m.vy * 14);
        c.stroke();
      }
    }

    function sunAndMoon() {
      const cx = w * 0.5;
      const cy = horizon + h * 0.04;
      const rx = w * 0.52;
      const ry = horizon * 0.92;
      const sunA = Math.PI * (0.3 - 0.44 * night);
      const moonA = Math.PI * (1.14 - 0.44 * night);
      const sx = cx + rx * Math.cos(sunA);
      const sy = cy - ry * Math.sin(sunA);
      const mx = cx + rx * Math.cos(moonA);
      const my = cy - ry * Math.sin(moonA);

      // Sol: se vuelve naranja al bajar.
      const low = Math.min(1, night * 1.8);
      const sunCore = mix("#f6d27a", "#e8743f", low);
      const glow = c.createRadialGradient(sx, sy, 0, sx, sy, 150);
      glow.addColorStop(0, sunCore);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      c.globalAlpha = 0.35 * (1 - night * 0.4);
      c.fillStyle = glow;
      c.fillRect(sx - 150, sy - 150, 300, 300);
      c.globalAlpha = 1;
      c.fillStyle = sunCore;
      c.beginPath();
      c.arc(sx, sy, 24, 0, Math.PI * 2);
      c.fill();

      // Luna llena con cráteres y halo.
      const mg = c.createRadialGradient(mx, my, 0, mx, my, 110);
      mg.addColorStop(0, "rgba(240,234,210,0.45)");
      mg.addColorStop(1, "rgba(240,234,210,0)");
      c.globalAlpha = 0.25 + 0.75 * night;
      c.fillStyle = mg;
      c.fillRect(mx - 110, my - 110, 220, 220);
      c.globalAlpha = 1;
      c.fillStyle = "#efe8cf";
      c.beginPath();
      c.arc(mx, my, 20, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "rgba(160,150,120,0.35)";
      for (const [dx, dy, r] of [
        [-6, -4, 4],
        [5, 3, 3],
        [-2, 8, 2.4],
        [7, -7, 2],
      ]) {
        c.beginPath();
        c.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
        c.fill();
      }
    }

    function drawClouds(p: Pal) {
      for (let i = clouds.length - 1; i >= 0; i--) {
        const cl = clouds[i];
        cl.x += cl.v;
        if (cl.rain > 0) {
          cl.rain -= 16;
          if (cl.rain <= 0) cl.rain = -1;
          // La nube llueve gotas que caen a distintos puntos del campo.
          for (let k = 0; k < 3; k++) {
            drops.push({
              x: cl.x + rnd(-55, 55) * cl.s,
              y: cl.y + 12 * cl.s,
              vy: rnd(7, 10),
              ty: fieldY(Math.random() * 0.98),
            });
          }
        }
        if (cl.rain < 0) {
          cl.alpha -= 0.012;
          if (cl.alpha <= 0) {
            clouds.splice(i, 1);
            continue;
          }
        }
        if (!cl.rain && cl.x > w + 140) cl.x = -140;
        const isRain = cl.rain !== 0;
        c.fillStyle = isRain ? mix(p.cloud, night > 0.5 ? "#4a5653" : "#8c9895", 0.6) : p.cloud;
        c.globalAlpha = (isRain ? 0.95 : 0.9) * cl.alpha;
        cloudShape(cl.x, cl.y, cl.s);
      }
      c.globalAlpha = 1;
    }

    function drawBirds(p: Pal) {
      const dayAlpha = 1 - night;
      birds = birds.filter((b) => b.x < w + 40 && b.y > -40);
      if (birds.length < 3 && Math.random() < 0.004) birds.push({ x: -20, y: rnd(60, horizon * 0.5), v: rnd(0.4, 0.7), vy: 0, s: rnd(0.8, 1.2) });
      c.strokeStyle = p.ink;
      c.lineWidth = 1.4;
      for (const b of birds) {
        b.x += b.v;
        b.y += b.vy;
        const flap = Math.sin(now * 0.012 + b.x * 0.1) * 3.5 * b.s;
        c.globalAlpha = 0.6 * dayAlpha;
        c.beginPath();
        c.moveTo(b.x - 8 * b.s, b.y - flap);
        c.quadraticCurveTo(b.x - 3 * b.s, b.y + 1, b.x, b.y);
        c.quadraticCurveTo(b.x + 3 * b.s, b.y + 1, b.x + 8 * b.s, b.y - flap);
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    function landscape(p: Pal) {
      const ridges: [number, number, number, string][] = [
        [26, horizon - 34, 0.6, p.hillFar],
        [18, horizon - 12, 2.1, p.hillNear],
      ];
      for (const [amp, base, ph, col] of ridges) {
        c.beginPath();
        c.moveTo(0, h);
        for (let x = 0; x <= w + 8; x += 8) {
          c.lineTo(x, base + Math.sin(x * 0.006 + ph) * amp + Math.sin(x * 0.017 + ph * 2) * amp * 0.3);
        }
        c.lineTo(w, h);
        c.closePath();
        c.fillStyle = col;
        c.fill();
      }
      c.fillStyle = p.field;
      c.fillRect(0, horizon, w, h - horizon);
      for (let i = 0; i < 10; i++) {
        const y = horizon + (h - horizon) * Math.pow(i / 10, 1.5);
        const band = (h - horizon) * 0.035 * (1 + i * 0.3);
        if (i % 2) {
          c.fillStyle = p.stripe;
          c.fillRect(0, y, w, band);
        }
      }
    }

    function drawPlant(pl: Plant, p: Pal) {
      const x = pl.nx * w;
      const y = fieldY(pl.nf);
      const pop = Math.min(1, (now - pl.born) / 450);
      const k = depth(pl.nf) * (1 - Math.pow(1 - pop, 3));
      const g = Math.min(1, pl.g);
      const sway = Math.sin(now * 0.002 + x * 0.05) * 2.4 * k * g;

      c.fillStyle = "rgba(0,0,0,0.12)";
      c.beginPath();
      c.ellipse(x, y + 1, 9 * k, 2.4 * k, 0, 0, Math.PI * 2);
      c.fill();

      if (g < 0.18) {
        // Brote: dos hojitas.
        c.fillStyle = p.crop;
        c.beginPath();
        c.ellipse(x - 3 * k, y - 4 * k, 3.5 * k, 1.8 * k, -0.6, 0, Math.PI * 2);
        c.ellipse(x + 3 * k, y - 5 * k, 3.5 * k, 1.8 * k, 0.6, 0, Math.PI * 2);
        c.fill();
        return;
      }
      c.lineCap = "round";
      if (pl.kind === "wheat") {
        const H = (8 + 36 * g) * k;
        c.strokeStyle = p.crop;
        c.lineWidth = 1.6 * k;
        for (let j = -1; j <= 1; j++) {
          const ox = j * 3 * k;
          const tx = x + ox + sway + j * 2 * k;
          c.beginPath();
          c.moveTo(x + ox, y);
          c.quadraticCurveTo(x + ox, y - H * 0.5, tx, y - H);
          c.stroke();
          if (g > 0.55) {
            c.fillStyle = p.ear;
            c.beginPath();
            c.ellipse(tx, y - H - 4 * k, 2.1 * k, 5.5 * k, j * 0.2 + sway * 0.03, 0, Math.PI * 2);
            c.fill();
          }
        }
      } else if (pl.kind === "corn") {
        const H = (10 + 50 * g) * k;
        c.strokeStyle = p.cropDark;
        c.lineWidth = 2.6 * k;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x, y - H * 0.5, x + sway, y - H);
        c.stroke();
        c.strokeStyle = p.crop;
        c.lineWidth = 2 * k;
        for (let i = 0; i < 3; i++) {
          const ly = y - H * (0.3 + 0.22 * i);
          const side = i % 2 ? 1 : -1;
          c.beginPath();
          c.moveTo(x + sway * (0.3 + 0.2 * i), ly);
          c.quadraticCurveTo(x + side * 8 * k, ly - 6 * k, x + side * 14 * k * g + sway, ly + 2 * k);
          c.stroke();
        }
        if (g > 0.7) {
          c.fillStyle = p.cob;
          c.beginPath();
          c.ellipse(x + 3 * k + sway * 0.5, y - H * 0.55, 2.4 * k, 5 * k, 0.3, 0, Math.PI * 2);
          c.fill();
        }
      } else {
        const H = (10 + 48 * g) * k;
        const hx = x + sway;
        const hy = y - H;
        c.strokeStyle = p.cropDark;
        c.lineWidth = 2 * k;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x, y - H * 0.5, hx, hy);
        c.stroke();
        c.fillStyle = p.crop;
        c.beginPath();
        c.ellipse(x - 5 * k, y - H * 0.4, 5 * k, 2.2 * k, -0.5, 0, Math.PI * 2);
        c.ellipse(x + 5 * k, y - H * 0.55, 5 * k, 2.2 * k, 0.5, 0, Math.PI * 2);
        c.fill();
        if (g > 0.7) {
          const r = 6.5 * k * Math.min(1, (g - 0.7) / 0.3 + 0.3);
          c.fillStyle = p.petal;
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 + now * 0.0002;
            c.beginPath();
            c.ellipse(hx + Math.cos(a) * r, hy + Math.sin(a) * r, r * 0.55, r * 0.25, a, 0, Math.PI * 2);
            c.fill();
          }
          c.fillStyle = mix("#5a3a1c", "#2a1c10", night);
          c.beginPath();
          c.arc(hx, hy, r * 0.6, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.lineCap = "butt";
    }

    function drawFarmer(f: Farmer) {
      const gx = f.nx * w;
      const gy = fieldY(f.nf);
      const s = depth(f.nf) * 1.25;
      const walk = f.drag ? 0 : Math.sin(now * 0.009 + f.phase);
      const lift = f.drag ? 14 : 0;
      const shade = (col: string) => mix(col, "#0b120d", night * 0.55);

      c.fillStyle = "rgba(0,0,0,0.18)";
      c.beginPath();
      c.ellipse(gx, gy + 1, (f.drag ? 8 : 11) * s, 3 * s, 0, 0, Math.PI * 2);
      c.fill();

      c.save();
      c.translate(gx, gy - lift);
      if (f.drag) c.rotate(Math.sin(now * 0.012) * 0.18);
      c.scale(s * f.dir, s);
      c.lineCap = "round";
      const bob = Math.abs(walk) * 1.4;
      // Piernas
      c.strokeStyle = shade("#3d4c5c");
      c.lineWidth = 3;
      c.beginPath();
      if (f.drag) {
        const d = Math.sin(now * 0.02) * 4;
        c.moveTo(0, -14);
        c.lineTo(-3 + d, 0);
        c.moveTo(0, -14);
        c.lineTo(3 - d, 0);
      } else {
        c.moveTo(0, -14 - bob);
        c.lineTo(-walk * 6, 0);
        c.moveTo(0, -14 - bob);
        c.lineTo(walk * 6, 0);
      }
      c.stroke();
      // Torso
      c.strokeStyle = shade(f.shirt);
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(0, -15 - bob);
      c.lineTo(1, -28 - bob);
      c.stroke();
      // Cabeza y sombrero
      c.fillStyle = shade("#c99b74");
      c.beginPath();
      c.arc(1, -34 - bob, 4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = shade(f.hat);
      c.beginPath();
      c.ellipse(1, -37.5 - bob, 8.5, 1.8, 0, 0, Math.PI * 2);
      c.fill();
      c.fillRect(-3, -42 - bob, 8, 4.5);
      // Brazo y azada
      c.strokeStyle = shade(f.shirt);
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(1, -26 - bob);
      c.lineTo(8 + walk * 2, -18);
      c.stroke();
      c.strokeStyle = shade("#7a5a36");
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(8 + walk * 2, -18);
      c.lineTo(16, -2);
      c.moveTo(14, -3);
      c.lineTo(20, -1);
      c.stroke();
      // Farol de noche
      if (night > 0.05) {
        const lx = -6;
        const ly = -18 - bob;
        const lg = c.createRadialGradient(lx, ly, 0, lx, ly, 34);
        lg.addColorStop(0, `rgba(255,205,120,${0.55 * night})`);
        lg.addColorStop(1, "rgba(255,205,120,0)");
        c.fillStyle = lg;
        c.fillRect(lx - 34, ly - 34, 68, 68);
        c.fillStyle = `rgba(255,220,150,${night})`;
        c.fillRect(lx - 2, ly - 2, 4, 5);
      }
      c.restore();
      c.lineCap = "butt";
    }

    function rain(p: Pal) {
      c.strokeStyle = p.water;
      c.lineWidth = 1.2;
      c.globalAlpha = 0.7;
      const next: Drop[] = [];
      c.beginPath();
      for (const d of drops) {
        d.y += d.vy;
        if (d.y >= d.ty) {
          rings.push({ x: d.x, y: d.ty, r: 1, life: 1 });
          // El agua hace crecer lo que está cerca.
          let watered = false;
          for (const pl of plants) {
            if (Math.abs(pl.nx * w - d.x) < 26 && Math.abs(fieldY(pl.nf) - d.ty) < 26) {
              pl.g = Math.min(1, pl.g + 0.02);
              watered = true;
            }
          }
          if (!watered && Math.random() < 0.012 && plants.length < 180) {
            plants.push({ nx: d.x / w, nf: (d.ty - horizon) / (h - horizon), g: 0.05, kind: KINDS[Math.floor(Math.random() * 3)], born: now });
          }
          continue;
        }
        c.moveTo(d.x, d.y);
        c.lineTo(d.x - 1, d.y - 9);
        next.push(d);
      }
      c.stroke();
      drops = next;
      rings = rings.filter((r) => r.life > 0);
      for (const r of rings) {
        r.r += 0.5;
        r.life -= 0.05;
        c.globalAlpha = r.life * 0.6;
        c.beginPath();
        c.ellipse(r.x, r.y, r.r * 1.8, r.r * 0.6, 0, 0, Math.PI * 2);
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    function fireflies() {
      if (night < 0.05) return;
      for (const f of flies) {
        f.ph += 0.02;
        const x = f.nx * w + Math.sin(f.ph * 0.7) * 18;
        const y = fieldY(f.nf) - 18 + Math.cos(f.ph) * 10;
        const a = night * (0.4 + 0.6 * Math.max(0, Math.sin(f.ph * 1.7)));
        const g = c.createRadialGradient(x, y, 0, x, y, 7);
        g.addColorStop(0, `rgba(230,240,140,${a})`);
        g.addColorStop(1, "rgba(230,240,140,0)");
        c.fillStyle = g;
        c.fillRect(x - 7, y - 7, 14, 14);
      }
    }

    function frame(t: number) {
      now = t;
      if (night !== to) {
        const k = Math.min(1, (t - start) / DUR);
        night = from + (to - from) * ease(k);
        if (k >= 1) night = to;
      }
      const p = palette(night);
      for (const pl of plants) if (pl.g < 1) pl.g += 0.0007;
      for (const f of farmers) {
        if (f.drag) continue;
        f.nx += f.dir * f.speed;
        if (f.nx > 0.97) f.dir = -1;
        if (f.nx < 0.03) f.dir = 1;
      }

      c.clearRect(0, 0, w, h);
      sky(p);
      starsAndMeteors();
      sunAndMoon();
      drawClouds(p);
      drawBirds(p);
      landscape(p);
      // Plantas y agricultores ordenados por profundidad.
      const items: ({ y: number; plant: Plant } | { y: number; farmer: Farmer })[] = [
        ...plants.map((plant) => ({ y: plant.nf, plant })),
        ...farmers.map((farmer) => ({ y: farmer.nf + (farmer.drag ? 2 : 0), farmer })),
      ];
      items.sort((a, b) => a.y - b.y);
      for (const it of items) {
        if ("plant" in it) drawPlant(it.plant, p);
        else drawFarmer(it.farmer);
      }
      rain(p);
      fireflies();
      raf = requestAnimationFrame(frame);
    }

    // --- Interacción ----------------------------------------------------

    let dragging: Farmer | null = null;
    let lastPlant: { x: number; y: number } | null = null;
    let down = false;

    function point(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function farmerAt(x: number, y: number): Farmer | null {
      for (let i = farmers.length - 1; i >= 0; i--) {
        const f = farmers[i];
        const s = depth(f.nf) * 1.25;
        const fx = f.nx * w;
        const fy = fieldY(f.nf);
        if (Math.abs(x - fx) < 14 * s + 6 && y > fy - 48 * s && y < fy + 8) return f;
      }
      return null;
    }
    function plantAt(x: number, y: number) {
      if (y < horizon + 4 || plants.length >= 180) return;
      plants.push({ nx: x / w, nf: Math.min(1, (y - horizon) / (h - horizon)), g: 0.02, kind: KINDS[Math.floor(Math.random() * 3)], born: now });
      lastPlant = { x, y };
    }
    function onDown(e: PointerEvent) {
      const { x, y } = point(e);
      down = true;
      const f = farmerAt(x, y);
      if (f) {
        dragging = f;
        f.drag = true;
        canvas!.setPointerCapture(e.pointerId);
        canvas!.style.cursor = "grabbing";
        return;
      }
      if (toolRef.current === "rain") {
        clouds.push({ x, y: Math.max(h * 0.08, Math.min(y < horizon ? y : h * 0.2, horizon - 60)), s: 1.15, v: 0.12, rain: 4500, alpha: 1 });
        return;
      }
      if (y < horizon) {
        // Tocar el cielo: aves de día, estrella fugaz de noche.
        if (night > 0.5) shooting.push({ x, y, vx: rnd(4, 6), vy: rnd(1.5, 2.5), life: 1 });
        else for (let i = 0; i < 3; i++) birds.push({ x: x + i * 14, y: y + i * 8, v: rnd(1.2, 1.8), vy: -rnd(0.3, 0.6), s: rnd(0.8, 1.1) });
        return;
      }
      plantAt(x, y);
    }
    function onMove(e: PointerEvent) {
      const { x, y } = point(e);
      if (dragging) {
        dragging.nx = Math.min(0.98, Math.max(0.02, x / w));
        dragging.nf = Math.min(1, Math.max(0.02, (y - horizon) / (h - horizon)));
        return;
      }
      if (down && toolRef.current === "plant" && lastPlant && Math.hypot(x - lastPlant.x, y - lastPlant.y) > 22) {
        plantAt(x, y);
      }
      canvas!.style.cursor = farmerAt(x, y) ? "grab" : toolRef.current === "rain" || y >= horizon ? "crosshair" : "pointer";
    }
    function onUp(e: PointerEvent) {
      down = false;
      lastPlant = null;
      if (dragging) {
        dragging.drag = false;
        dragging = null;
        try {
          canvas!.releasePointerCapture(e.pointerId);
        } catch {}
        canvas!.style.cursor = "grab";
      }
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    resize();
    let raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      api.current = null;
    };
  }, []);

  const hint =
    tool === "plant"
      ? "Toca la tierra para sembrar · arrastra a un agricultor para moverlo"
      : "Toca donde quieras que llueva · el agua hace crecer lo sembrado";

  const btn = (active: boolean) =>
    `flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
      active ? "bg-moss text-paper" : "text-ink-soft hover:text-ink"
    }`;

  return (
    <>
      <canvas ref={ref} aria-hidden="true" className="fixed inset-0 h-full w-full touch-none" />
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:bottom-6 lg:left-6 lg:items-start lg:px-0">
        <p aria-live="polite" className="max-w-sm rounded-2xl bg-paper/85 px-3 py-1 text-center text-sm text-ink-soft backdrop-blur lg:text-left">
          {hint}
        </p>
        <div
          role="toolbar"
          aria-label="Jugar con el campo"
          className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-full border border-rule bg-paper/90 p-1 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.45)] backdrop-blur"
        >
          <button type="button" aria-pressed={tool === "plant"} onClick={() => setTool("plant")} className={btn(tool === "plant")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="M12 21v-9" />
              <path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6Z" />
              <path d="M12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5Z" />
            </svg>
            Sembrar
          </button>
          <button type="button" aria-pressed={tool === "rain"} onClick={() => setTool("rain")} className={btn(tool === "rain")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="M7 15a4 4 0 1 1 .9-7.9A5 5 0 0 1 17.5 9 3 3 0 0 1 17 15H7Z" />
              <path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2" />
            </svg>
            Lluvia
          </button>
          <span className="mx-1 h-6 w-px bg-rule" aria-hidden="true" />
          <button type="button" onClick={toggleTheme} className={btn(false)} aria-label={night ? "Cambiar a modo día" : "Cambiar a modo noche"}>
            {night ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
              </svg>
            )}
            {night ? "Día" : "Noche"}
          </button>
          <button type="button" onClick={() => api.current?.clear()} className={btn(false)}>
            Limpiar
          </button>
        </div>
      </div>
    </>
  );
}
