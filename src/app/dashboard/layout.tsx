import { redirect } from "next/navigation";
import { getCurrentUser, getAiSpend } from "@/lib/supabase/queries";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, aiSpend] = await Promise.all([getCurrentUser(), getAiSpend()]);

  if (!user) {
    redirect("/login");
  }

  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? null;
  const commitSha =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    null;

  return (
    <div className="flex min-h-dvh flex-col bg-[#f5f5f7] lg:flex-row">
      <Sidebar
        userEmail={user.email ?? null}
        buildTime={buildTime}
        commitSha={commitSha}
        aiSpend={aiSpend}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
