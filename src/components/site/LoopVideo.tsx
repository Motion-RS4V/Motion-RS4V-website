"use client";

import { useEffect, useRef } from "react";

type Props = {
  src: string;
  poster: string;
  label: string;
  className?: string;
  /** Start playing before it scrolls into view (the hero). */
  eager?: boolean;
};

/**
 * A muted, looping clip that only plays while on screen, and never plays for visitors who prefer reduced motion.
 */
export function LoopVideo({ src, poster, label, className, eager = false }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) {
      video.pause();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { rootMargin: "120px 0px" },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      className={className}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      autoPlay={eager}
      preload={eager ? "auto" : "metadata"}
      aria-label={label}
    />
  );
}
