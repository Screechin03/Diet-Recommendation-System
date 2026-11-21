"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Button, Notice, PageSpinner } from "@/components/care/ui";
import type { Role } from "@/lib/care";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";

/**
 * Shows the page only to the right kind of account. Signed-out visitors go to the matching login page,
 * and the wrong role is sent to its own home (doctors to /doctor, patients to /care).
 * Data access itself is enforced by the database; this only keeps the screens tidy.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, role: actual, roleLoading, accountError, careAvailable, refreshAccount } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!SUPABASE_CONFIGURED || roleLoading || accountError) return;
    if (!user) {
      router.replace(role === "doctor" ? `/doctor/login?next=${encodeURIComponent(pathname)}` : `/login?next=${encodeURIComponent(pathname)}`);
    } else if (actual && actual !== role) {
      router.replace(actual === "doctor" ? "/doctor" : "/care");
    }
  }, [accountError, actual, pathname, role, roleLoading, router, user]);

  if (!SUPABASE_CONFIGURED) {
    return (
      <div className="mx-auto max-w-xl px-4 py-14">
        <Notice tone="amber" title="Accounts aren't configured">
          Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to use patient and doctor accounts.
        </Notice>
      </div>
    );
  }
  if (accountError) {
    return (
      <div className="mx-auto max-w-xl px-4 py-14">
        <Notice tone="red" title="Couldn't load your account" action={<Button size="sm" onClick={() => void refreshAccount()}>Try again</Button>}>
          {accountError}
        </Notice>
      </div>
    );
  }
  if (roleLoading || !user || actual !== role) return <PageSpinner />;
  if (!careAvailable) {
    return (
      <div className="mx-auto max-w-xl px-4 py-14">
        <Notice tone="amber" title="Doctor features aren't set up yet">
          Run <code>supabase/schema.sql</code> in the Supabase SQL editor, then reload this page.
        </Notice>
      </div>
    );
  }
  return <>{children}</>;
}
