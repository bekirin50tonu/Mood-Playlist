"use client";

export function LoginButton() {
  return (
    <a
      href="/api/auth/login"
      className="inline-flex items-center justify-center gap-2 rounded-full bg-spotify hover:bg-spotify-dark active:scale-[0.98] text-neutral-950 font-semibold px-7 py-3.5 text-base transition-colors shadow-lg shadow-spotify/20"
    >
      <SpotifyLogo />
      <span>Log in with Spotify</span>
    </a>
  );
}

function SpotifyLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-5 w-5"
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.59 14.41a.75.75 0 0 1-1.03.25c-2.82-1.72-6.38-2.12-10.55-1.16a.75.75 0 1 1-.33-1.46c4.55-1.04 8.49-.59 11.66 1.34.36.22.47.68.25 1.03zm1.23-2.74a.94.94 0 0 1-1.29.31c-3.23-1.98-8.16-2.56-11.98-1.4a.94.94 0 1 1-.55-1.8c4.36-1.34 9.78-.69 13.51 1.6.45.27.59.85.31 1.29zm.11-2.85C14.07 8.6 7.97 8.37 4.49 9.39a1.13 1.13 0 1 1-.66-2.16c4-1.17 10.73-.91 14.94 1.53a1.13 1.13 0 1 1-1.16 1.95z" />
    </svg>
  );
}
