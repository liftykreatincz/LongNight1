"use client";

import { useState, useTransition, useEffect } from "react";
import { KeyRound, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveAnthropicKey } from "./actions";

interface SettingsFormProps {
  initialKey: string;
  hasExistingKey: boolean;
}

export function SettingsForm({ initialKey, hasExistingKey }: SettingsFormProps) {
  const [value, setValue] = useState(initialKey);
  const [isPending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!justSaved) return;
    const timeout = setTimeout(() => setJustSaved(false), 4000);
    return () => clearTimeout(timeout);
  }, [justSaved]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveAnthropicKey(formData);
      if (result.success) {
        toast.success("Nastavení uloženo");
        setJustSaved(true);
      } else {
        toast.error(result.error || "Nepodařilo se uložit nastavení");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="anthropic_api_key"
          className="mb-2 block text-sm font-semibold text-[#1d1d1f]"
        >
          Anthropic (Claude) API klíč
        </label>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868b]" />
          <input
            id="anthropic_api_key"
            name="anthropic_api_key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              hasExistingKey ? "•••••••• (klíč uložen)" : "sk-ant-..."
            }
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-xl border border-[#d2d2d7]/80 bg-white py-3 pl-11 pr-4 text-sm font-medium text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-all placeholder:text-[#c7c7cc] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/15"
          />
        </div>
        <p className="mt-2 text-xs text-[#6e6e73]">
          Klíč se použije pro AI analýzu reklamních kreativ. Uložen je bezpečně
          ve vašem účtu. Nechte prázdné pro smazání.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-full bg-[#0071e3] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0077ed] active:bg-[#006edb] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Ukládání…
            </>
          ) : (
            <>Uložit</>
          )}
        </button>
        {justSaved && !isPending && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <Check className="h-4 w-4" />
            Uloženo
          </span>
        )}
      </div>
    </form>
  );
}
