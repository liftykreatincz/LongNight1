"use client";

import { useState, useTransition } from "react";
import { login } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

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
    <div className="relative min-h-dvh w-full overflow-hidden bg-[#f5f5f7] flex items-center justify-center">
      {/* Very subtle ambient wash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0,113,227,0.07) 0%, transparent 60%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-10 px-6 py-16 sm:px-8">
        {/* Hero */}
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-6xl sm:text-7xl font-extrabold tracking-[-0.035em] text-[#1d1d1f] leading-[0.95]">
            Long Night
          </h1>
          <p className="text-base sm:text-lg font-medium text-[#6e6e73] tracking-tight max-w-sm leading-relaxed">
            Analýza kreativ z Meta Ads.
            <br />
            Chytře, rychle a s AI.
          </p>
        </div>

        {/* Login card */}
        <div className="w-full rounded-2xl border border-[#d2d2d7]/60 bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] sm:p-8">
          <form action={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="email"
                className="text-sm font-semibold text-[#1d1d1f]"
              >
                E-mail
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="vas@email.cz"
                required
                autoComplete="email"
                className="h-12 rounded-xl border-[#d2d2d7] bg-white text-[#1d1d1f] placeholder:text-[#86868b] focus-visible:border-[#0071e3] focus-visible:ring-[#0071e3]/25"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="password"
                className="text-sm font-semibold text-[#1d1d1f]"
              >
                Heslo
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="h-12 rounded-xl border-[#d2d2d7] bg-white text-[#1d1d1f] placeholder:text-[#86868b] focus-visible:border-[#0071e3] focus-visible:ring-[#0071e3]/25"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0071e3] text-base font-semibold text-white shadow-sm transition-all hover:bg-[#0077ed] active:bg-[#006edb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f7] disabled:pointer-events-none disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Přihlašování...
                </>
              ) : (
                "Přihlásit se"
              )}
            </button>
          </form>
        </div>

        <p className="text-xs font-medium text-[#86868b]">
          Pouze pro oprávněné osoby
        </p>
      </div>
    </div>
  );
}
