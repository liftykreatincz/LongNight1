import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { LogOut } from "lucide-react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-dvh bg-[#f5f5f7]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#d2d2d7]/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <h1 className="text-xl font-extrabold tracking-[-0.02em] text-[#1d1d1f] select-none">
            Long Night
          </h1>

          {/* User info + sign out */}
          <div className="flex items-center gap-4">
            <span className="hidden text-sm font-medium text-[#6e6e73] sm:inline">
              {user.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-[#6e6e73] transition-colors hover:bg-black/[0.04] hover:text-[#1d1d1f]"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Odhlásit se</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        {children}
      </main>
    </div>
  );
}
