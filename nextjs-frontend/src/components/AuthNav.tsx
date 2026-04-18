"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

function shortenEmail(email: string | undefined): string {
  if (!email) return "Account";
  if (email.length <= 24) return email;
  return `${email.slice(0, 21)}...`;
}

export function AuthNav() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    try {
      await signOut();
      router.push("/");
      router.refresh();
    } catch {
      // Ignore transient sign-out errors in the UI.
    }
  }

  if (loading || !user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Sign up
        </Link>
        {loading ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Checking session...</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/saved-recipes"
        className="rounded-md px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
      >
        Saved
      </Link>
      <Link
        href="/history"
        className="rounded-md px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
      >
        History
      </Link>
      <div className="hidden text-xs text-zinc-500 dark:text-zinc-400 sm:block">{shortenEmail(user.email)}</div>
      <button
        onClick={handleSignOut}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Sign out
      </button>
    </div>
  );
}
