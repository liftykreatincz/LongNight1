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
        // Could show a toast here in the future
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
          <button className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-sm text-red-400 transition-all hover:border-red-500/30 hover:bg-red-500/20" />
        }
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </DialogTrigger>
      <DialogContent className="border-white/[0.08] bg-gray-950 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Delete Shop</DialogTitle>
          <DialogDescription className="text-white/40">
            Are you sure you want to delete <strong className="text-white/70">{shopName}</strong>?
            This will permanently remove the shop and all associated data.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="border-white/[0.06] bg-white/[0.02]">
          <button
            onClick={() => setOpen(false)}
            disabled={isPending}
            className="flex h-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-medium text-white/70 transition-all hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="flex h-9 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-all hover:bg-red-500 disabled:pointer-events-none disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete Shop"
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
