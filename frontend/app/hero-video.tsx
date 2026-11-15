"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatedBackground } from "./background";

// Portada con video de fondo y parallax por capas.
// La sección mide más que la pantalla y su interior queda fijo (sticky) mientras se hace scroll:
// - el video se acerca y sube despacio (capa lejana),
// - el texto sube más rápido y se desvanece (capa cercana).
// El archivo va en /public/hero/campo.mp4 (opcional: /public/hero/campo.jpg como póster).
// Si el video no existe o no carga, se usa la escena animada en canvas.
export const HERO_VIDEO = "/hero/campo.mp4";
export const HERO_POSTER = "/hero/campo.jpg";

export function ParallaxHero({ children }: { children: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const media = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      video.current?.pause();
      return;
    }
    let raf = 0;
    function update() {
      raf = 0;
      const el = section.current;
      if (!el) return;
      const vh = window.innerHeight;
      const travel = Math.max(1, el.offsetHeight - vh);
      const top = el.getBoundingClientRect().top;
      const p = Math.min(1, Math.max(0, -top / travel));
      if (media.current) media.current.style.transform = `translate3d(0, ${p * -60}px, 0) scale(${1.05 + p * 0.35})`;
      if (content.current) {
        content.current.style.transform = `translate3d(0, ${p * -220}px, 0)`;
        content.current.style.opacity = String(Math.max(0, 1 - p * 1.6));
      }
      if (veil.current) veil.current.style.opacity = String(Math.max(0, 1 - p * 1.3));
    }
    function onScroll() {
      if (!raf) raf = requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section ref={section} className="relative h-[180vh]">
      <div className="sticky top-0 isolate flex h-[100svh] items-center overflow-hidden">
        <div ref={media} className="absolute inset-0 -z-10 origin-center will-change-transform">
          {failed ? (
            <AnimatedBackground />
          ) : (
            <video
              ref={video}
              className="h-full w-full object-cover object-[70%_center]"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              poster={HERO_POSTER}
              aria-hidden="true"
            >
              <source src={HERO_VIDEO} type="video/mp4" onError={() => setFailed(true)} />
            </video>
          )}
        </div>
        {/* Velo de papel para leer el texto; se retira al hacer scroll y deja ver el campo completo. */}
        <div
          ref={veil}
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-b from-paper/92 via-paper/85 to-paper/45 lg:bg-gradient-to-r lg:from-paper lg:via-paper/75 lg:to-paper/0"
        />
        <div ref={content} className="w-full will-change-transform">
          {children}
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-paper to-paper/0" />
      </div>
    </section>
  );
}
