/** "Voice in Steps" brand mark: speech bubble carved with three ascending civic steps. */
export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M 13 6 H 35 A 8 8 0 0 1 43 14 V 28 A 8 8 0 0 1 35 36 H 16.5 L 8.2 42.4 C 6.7 43.5 5 42.4 5 40.6 V 14 A 8 8 0 0 1 13 6 Z M 14 26 h 7 a 2 2 0 0 1 0 4 h -7 a 2 2 0 0 1 0 -4 Z M 20.5 19 h 7 a 2 2 0 0 1 0 4 h -7 a 2 2 0 0 1 0 -4 Z M 27 12 h 7 a 2 2 0 0 1 0 4 h -7 a 2 2 0 0 1 0 -4 Z"
      />
    </svg>
  );
}
