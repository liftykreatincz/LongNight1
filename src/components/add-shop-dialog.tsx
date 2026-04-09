"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { addShop } from "@/app/dashboard/actions";

export function AddShopDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addShop(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children as React.ReactElement}></DialogTrigger>
      <DialogContent className="border-[#d2d2d7]/60 bg-white text-[#1d1d1f] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight text-[#1d1d1f]">
            Přidat e-shop
          </DialogTitle>
          <DialogDescription className="text-[#6e6e73]">
            Propojte svůj e-shop s Meta Ads pro analýzu kreativ.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="mt-2 flex flex-col gap-4">
          {/* Shop name */}
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="shop-name"
              className="text-sm font-semibold text-[#1d1d1f]"
            >
              Název e-shopu
            </Label>
            <Input
              id="shop-name"
              name="name"
              placeholder="Můj e-shop"
              required
              className="h-11 rounded-xl border-[#d2d2d7] bg-white text-[#1d1d1f] placeholder:text-[#86868b] focus-visible:border-[#0071e3] focus-visible:ring-[#0071e3]/25"
            />
          </div>

          {/* Meta token */}
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="meta-token"
              className="text-sm font-semibold text-[#1d1d1f]"
            >
              Meta Ads API token
            </Label>
            <Input
              id="meta-token"
              name="meta_token"
              type="password"
              placeholder="Váš API token"
              required
              className="h-11 rounded-xl border-[#d2d2d7] bg-white text-[#1d1d1f] placeholder:text-[#86868b] focus-visible:border-[#0071e3] focus-visible:ring-[#0071e3]/25"
            />
          </div>

          {/* Meta account ID */}
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="meta-account-id"
              className="text-sm font-semibold text-[#1d1d1f]"
            >
              Meta Ads Account ID
            </Label>
            <Input
              id="meta-account-id"
              name="meta_account_id"
              placeholder="act_123456789"
              required
              className="h-11 rounded-xl border-[#d2d2d7] bg-white text-[#1d1d1f] placeholder:text-[#86868b] focus-visible:border-[#0071e3] focus-visible:ring-[#0071e3]/25"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending}
            className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0071e3] text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0077ed] active:bg-[#006edb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Přidávám...
              </>
            ) : (
              "Přidat e-shop"
            )}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
