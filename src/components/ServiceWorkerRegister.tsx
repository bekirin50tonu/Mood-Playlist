"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    // Don't register in dev — Turbopack already handles HMR + cache-busting,
    // and an offline-first SW that caches the shell will serve stale HTML that
    // references dead chunk hashes after a server restart, producing a black
    // screen. The SW is only useful in production deploys.
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);
  }, []);

  return null;
}
