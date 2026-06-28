"use client";

export function Loader({ message = "Generating your playlist…" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5 animate-fade-in">
      <span
        aria-hidden
        className="block h-12 w-12 rounded-full border-4 border-neutral-700 border-t-spotify animate-spin-slow"
      />
      <p className="text-sm uppercase tracking-widest text-neutral-400">
        {message}
      </p>
    </div>
  );
}
