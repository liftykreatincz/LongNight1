"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Palette, Settings, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/dashboard/actions";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  matches: (pathname: string) => boolean;
  disabled?: boolean;
};

function buildNavItems(pathname: string, shopId: string | null): NavItem[] {
  const creativesHref = shopId ? `/dashboard/${shopId}/creatives` : "#";
  return [
    {
      href: "/dashboard",
      label: "Přehled",
      icon: Home,
      matches: (p) =>
        p === "/dashboard" ||
        (p.startsWith("/dashboard/") &&
          !p.startsWith("/dashboard/settings") &&
          !p.includes("/creatives")),
    },
    {
      href: creativesHref,
      label: "Kreativy",
      icon: Palette,
      matches: (p) => p.includes("/creatives"),
      disabled: !shopId,
    },
    {
      href: "/dashboard/settings",
      label: "Nastavení",
      icon: Settings,
      matches: (p) => p.startsWith("/dashboard/settings"),
    },
  ];
}

function extractShopId(pathname: string): string | null {
  const match = pathname.match(/^\/dashboard\/([^/]+)/);
  if (!match) return null;
  const id = match[1];
  if (id === "settings") return null;
  return id;
}

function formatBuildTime(buildTime?: string | null): string | null {
  if (!buildTime) return null;
  const date = new Date(buildTime);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatUsd(n: number): string {
  if (n <= 0) return "$0";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

interface SidebarProps {
  userEmail: string | null;
  buildTime?: string | null;
  commitSha?: string | null;
  aiSpend?: { today: number; month: number };
}

export function Sidebar({ userEmail, buildTime, commitSha, aiSpend }: SidebarProps) {
  const pathname = usePathname() || "/dashboard";
  const [mobileOpen, setMobileOpen] = useState(false);

  const shopId = useMemo(() => extractShopId(pathname), [pathname]);
  const navItems = useMemo(
    () => buildNavItems(pathname, shopId),
    [pathname, shopId]
  );

  const buildLabel = formatBuildTime(buildTime);
  const shortSha = commitSha ? commitSha.slice(0, 7) : null;

  const closeMobile = () => setMobileOpen(false);

  const navContent = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = item.matches(pathname) && !item.disabled;
        const baseClasses =
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors";
        if (item.disabled) {
          return (
            <span
              key={item.label}
              className={cn(
                baseClasses,
                "cursor-not-allowed text-[#c7c7cc] select-none"
              )}
              aria-disabled="true"
              title="Vyberte nejprve e-shop"
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
              <span className="font-medium">{item.label}</span>
            </span>
          );
        }
        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={closeMobile}
            className={cn(
              baseClasses,
              active
                ? "bg-black/[0.04] text-[#1d1d1f] font-semibold"
                : "text-[#6e6e73] font-medium hover:bg-black/[0.04] hover:text-[#1d1d1f]"
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const bottomContent = (
    <div className="border-t border-[#d2d2d7]/60 px-4 pt-4 pb-5">
      {userEmail && (
        <p className="truncate px-2 text-xs font-medium text-[#6e6e73]">
          {userEmail}
        </p>
      )}
      <form action={signOut} className="mt-2">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#6e6e73] transition-colors hover:bg-black/[0.04] hover:text-[#1d1d1f]"
        >
          <LogOut className="h-[18px] w-[18px]" strokeWidth={2} />
          <span>Odhlásit se</span>
        </button>
      </form>
      {aiSpend && (aiSpend.today > 0 || aiSpend.month > 0) && (
        <div className="mt-3 rounded-xl bg-black/[0.03] px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#86868b]">
            AI útraty
          </p>
          <div className="mt-1 flex items-baseline gap-3 text-[11px] font-medium text-[#6e6e73]">
            <span>
              Dnes{" "}
              <span className="font-semibold text-[#1d1d1f]">
                {formatUsd(aiSpend.today)}
              </span>
            </span>
            <span className="text-[#d2d2d7]">·</span>
            <span>
              Měsíc{" "}
              <span className="font-semibold text-[#1d1d1f]">
                {formatUsd(aiSpend.month)}
              </span>
            </span>
          </div>
        </div>
      )}
      {(buildLabel || shortSha) && (
        <div className="mt-3 px-2">
          {buildLabel && (
            <p className="text-[11px] font-medium text-[#86868b]">
              Nasazeno {buildLabel}
            </p>
          )}
          {shortSha && (
            <p className="mt-0.5 font-mono text-[10px] text-[#c7c7cc]">
              {shortSha}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const logoLink = (
    <Link
      href="/dashboard"
      onClick={closeMobile}
      className="block px-5 pt-6 pb-5"
    >
      <span className="text-xl font-extrabold tracking-[-0.022em] text-[#1d1d1f]">
        Long Night
      </span>
    </Link>
  );

  return (
    <>
      {/* Mobile top bar with hamburger */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[#d2d2d7]/60 bg-white/80 px-4 backdrop-blur-xl lg:hidden">
        <Link
          href="/dashboard"
          className="text-lg font-extrabold tracking-[-0.022em] text-[#1d1d1f]"
        >
          Long Night
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#1d1d1f] transition-colors hover:bg-black/[0.04]"
          aria-label="Otevřít menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile off-canvas drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={closeMobile}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between pr-2">
              {logoLink}
              <button
                type="button"
                onClick={closeMobile}
                className="mr-2 flex h-9 w-9 items-center justify-center rounded-full text-[#6e6e73] transition-colors hover:bg-black/[0.04] hover:text-[#1d1d1f]"
                aria-label="Zavřít menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {navContent}
            {bottomContent}
          </aside>
        </div>
      )}

      {/* Desktop sticky sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-[#d2d2d7]/60 bg-white lg:flex">
        {logoLink}
        {navContent}
        {bottomContent}
      </aside>
    </>
  );
}
