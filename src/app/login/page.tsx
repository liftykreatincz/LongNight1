"use client";

import { useState, useTransition } from "react";
import { login } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

/**
 * Generate deterministic star positions so they don't shift on re-render.
 * Each star gets a random position, size, opacity base, and animation timing.
 */
const STARS = Array.from({ length: 50 }, (_, i) => {
  // Simple seeded pseudo-random using index
  const seed = (i * 7919 + 104729) % 100000;
  const r = (offset: number) => ((seed * (offset + 1)) % 10000) / 10000;

  return {
    id: i,
    left: `${r(1) * 100}%`,
    top: `${r(2) * 100}%`,
    size: 1 + r(3) * 2.5, // 1–3.5px
    duration: `${2.5 + r(4) * 5}s`, // 2.5–7.5s
    delay: `${r(5) * 6}s`, // 0–6s
    slow: r(6) > 0.5,
  };
});

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await login(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-black flex items-center justify-center">
      {/* ── Gradient layers ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 40%, #0a1628 0%, #000000 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 50% 35%, rgba(30,58,95,0.4) 0%, transparent 70%)",
        }}
      />
      {/* Subtle vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 50%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      {/* ── Star field ── */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {STARS.map((star) => (
          <span
            key={star.id}
            className={
              star.slow ? "animate-star-twinkle-slow" : "animate-star-twinkle"
            }
            style={
              {
                position: "absolute",
                left: star.left,
                top: star.top,
                width: `${star.size}px`,
                height: `${star.size}px`,
                borderRadius: "50%",
                backgroundColor: "#cbd5e1",
                "--duration": star.duration,
                "--delay": star.delay,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-8 px-6 py-12 sm:px-8">
        {/* Title block */}
        <div className="animate-float flex flex-col items-center gap-3 text-center">
          <h1 className="animate-glow-pulse text-5xl font-bold tracking-tight text-white sm:text-6xl select-none">
            Long Night
          </h1>
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-blue-300/60 sm:text-sm">
            Meta Ads Creative Analysis
          </p>
        </div>

        {/* Login card */}
        <div className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-blue-950/20 backdrop-blur-xl sm:p-8">
          <form action={handleSubmit} className="flex flex-col gap-5">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-blue-100/70">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@company.com"
                required
                autoComplete="email"
                className="h-11 rounded-lg border-white/10 bg-white/[0.06] text-white placeholder:text-white/25 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-blue-100/70">
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="********"
                required
                autoComplete="current-password"
                className="h-11 rounded-lg border-white/10 bg-white/[0.06] text-white placeholder:text-white/25 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending}
              className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:shadow-blue-500/40 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:pointer-events-none disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        {/* Footer note */}
        <p className="text-xs text-white/20">
          Authorized personnel only
        </p>
      </div>
    </div>
  );
}
