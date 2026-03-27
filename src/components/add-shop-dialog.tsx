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
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="border-white/[0.08] bg-gray-950 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Add Eshop</DialogTitle>
          <DialogDescription className="text-white/40">
            Connect your shop with Meta Ads for creative analysis.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="mt-2 flex flex-col gap-4">
          {/* Shop name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shop-name" className="text-blue-100/70">
              Shop Name
            </Label>
            <Input
              id="shop-name"
              name="name"
              placeholder="My Eshop"
              required
              className="h-10 rounded-lg border-white/10 bg-white/[0.06] text-white placeholder:text-white/25 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30"
            />
          </div>

          {/* Meta token */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meta-token" className="text-blue-100/70">
              Meta Ads API Token
            </Label>
            <Input
              id="meta-token"
              name="meta_token"
              type="password"
              placeholder="Your API token"
              required
              className="h-10 rounded-lg border-white/10 bg-white/[0.06] text-white placeholder:text-white/25 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30"
            />
          </div>

          {/* Meta account ID */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meta-account-id" className="text-blue-100/70">
              Meta Ads Account ID
            </Label>
            <Input
              id="meta-account-id"
              name="meta_account_id"
              placeholder="act_123456789"
              required
              className="h-10 rounded-lg border-white/10 bg-white/[0.06] text-white placeholder:text-white/25 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30"
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
            className="mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:shadow-blue-500/40 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 disabled:pointer-events-none disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              "Add Shop"
            )}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
