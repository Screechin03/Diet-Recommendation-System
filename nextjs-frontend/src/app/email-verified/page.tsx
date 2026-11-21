"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";

/**
 * Landing page for the sign-up confirmation email (Supabase redirects here after verifying the address).
 * Deliberately does NOT log the user in: the Supabase client skips reading the session from the URL on
 * this path (see lib/supabase.ts), and the tokens are removed from the address bar. People then log in
 * themselves, on the website or in the app.
 */
type State = { status: "checking" } | { status: "verified" } | { status: "error"; message: string };

function readAuthError(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const code = hash.get("error_code") ?? query.get("error_code");
  const description = hash.get("error_description") ?? query.get("error_description");
  if (!code && !description && !hash.get("error") && !query.get("error")) return null;
  if (code === "otp_expired") {
    return "This verification link has expired or was already used. If you already verified, just log in. Otherwise sign up again to get a new link.";
  }
  return description?.replace(/\+/g, " ") || "We couldn't verify this link.";
}

const CHECKING: State = { status: "checking" };
let linkResult: State | null = null; // read once, before the URL is cleaned up

function readLinkResult(): State {
  if (!linkResult) {
    const error = readAuthError();
    linkResult = error ? { status: "error", message: error } : { status: "verified" };
  }
  return linkResult;
}

const noSubscription = () => () => {};

export default function EmailVerifiedPage() {
  // Server render shows nothing; the browser reads the link's result from the URL.
  const state = useSyncExternalStore(noSubscription, readLinkResult, () => CHECKING);

  useEffect(() => {
    readLinkResult();
    // Drop the one-time tokens / error details from the address bar (and from browser history).
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  if (state.status === "checking") {
    return <div className="mx-auto max-w-xl px-4 py-14" />;
  }

  const verified = state.status === "verified";

  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight">
          {verified ? "Your email is verified" : "Verification link problem"}
        </h1>
        {verified ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Thanks for confirming your email. Your MamaCare account is ready. Please log in with your email and
            password in the <span className="font-medium">MamaCare app</span> or on the website.
          </p>
        ) : (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {state.message}
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Log in on the website
          </Link>
          {!verified && (
            <Link href="/signup" className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700">
              Sign up again
            </Link>
          )}
        </div>
        {verified && (
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Signed up in the app? Go back to the MamaCare app and log in there. You can close this page.
          </p>
        )}
      </div>
    </div>
  );
}
