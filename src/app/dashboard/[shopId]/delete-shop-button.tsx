"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Trash2 } from "lucide-react";
import { deleteShop } from "@/app/dashboard/actions";

export function DeleteShopButton({
  shopId,
  shopName,
}: {
  shopId: string;
  shopName: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteShop(shopId);
      if (result?.error) {
        console.error(result.error);
      } else {
        setOpen(false);
        router.push("/dashboard");
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600 transition-all hover:border-red-300 hover:bg-red-100" />
        }
      >
        <Trash2 className="h-3.5 w-3.5" />
        Smazat
      </DialogTrigger>
      <DialogContent className="border-[#d2d2d7]/60 bg-white text-[#1d1d1f] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight text-[#1d1d1f]">
            Smazat e-shop
          </DialogTitle>
          <DialogDescription className="text-[#6e6e73]">
            Opravdu chcete smazat{" "}
            <strong className="text-[#1d1d1f]">{shopName}</strong>? Tuto akci
            nelze vrátit zpět — e-shop i všechna související data budou trvale
            odstraněna.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            onClick={() => setOpen(false)}
            disabled={isPending}
            className="flex h-10 items-center justify-center rounded-full border border-[#d2d2d7] bg-white px-5 text-sm font-semibold text-[#1d1d1f] transition-all hover:bg-[#f5f5f7] disabled:pointer-events-none disabled:opacity-60"
          >
            Zrušit
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="flex h-10 items-center justify-center gap-2 rounded-full bg-red-600 px-5 text-sm font-semibold text-white transition-all hover:bg-red-700 disabled:pointer-events-none disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Mažu...
              </>
            ) : (
              "Smazat e-shop"
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
