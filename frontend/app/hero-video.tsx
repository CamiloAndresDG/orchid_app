"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatedBackground } from "./background";

// Hero with a background video and layered parallax.
// The section is taller than the screen and its content stays fixed (sticky) while scrolling:
// - the video zooms in and rises slowly (far layer),
// - the text rises faster and fades out (near layer).
// The file lives at /public/hero/campo.mp4 (optional: /public/hero/campo.jpg as the poster).
// If the video doesn't exist or doesn't load, the animated canvas scene is used.
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
        {/* Paper veil so the text is readable; it lifts on scroll and reveals the whole field. */}
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
