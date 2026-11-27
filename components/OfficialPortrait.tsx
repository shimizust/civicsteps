"use client";

import { useState } from "react";

export function OfficialPortrait({ name, src, className, fallbackClassName, title }: {
  name: string;
  src: string | null;
  className: string;
  fallbackClassName: string;
  title?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && src !== failedSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" title={title} loading="lazy" referrerPolicy="no-referrer"
        className={`${className} bg-line object-cover`} onError={() => setFailedSrc(src)} />
    );
  }

  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
  return (
    <span title={title} aria-hidden="true"
      className={`${className} flex items-center justify-center bg-accent-soft text-accent ${fallbackClassName}`}>
      {initials}
    </span>
  );
}
