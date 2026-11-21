"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { careErrorMessage, getAccount, type Account, type Role } from "@/lib/care";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  /** True until the stored session has been checked. */
  loading: boolean;
  /** Patient or doctor profile of the signed-in user (null when signed out or still loading). */
  account: Account | null;
  role: Role | null;
  /** True until both the session and (when signed in) the role are known. */
  roleLoading: boolean;
  accountError: string | null;
  /** False when the database doesn't have the doctor features yet (supabase/schema.sql not run). */
  careAvailable: boolean;
  refreshAccount: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AccountResult = { ok: true; value: Account } | { ok: false; error: unknown };

function fetchAccount(): Promise<AccountResult> {
  return getAccount().then(
    (value): AccountResult => ({ ok: true, value }),
    (error): AccountResult => ({ ok: false, error }),
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(SUPABASE_CONFIGURED);
  const [account, setAccount] = useState<{ userId: string; value: Account } | null>(null);
  const [accountError, setAccountError] = useState<{ userId: string; message: string } | null>(null);
  const [careAvailable, setCareAvailable] = useState(true);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let subscription: { unsubscribe: () => void } | null = null;

    try {
      const supabase = getSupabaseBrowserClient();

      timeoutId = setTimeout(() => {
        setLoading(false);
      }, 5000);

      supabase.auth
        .getSession()
        .then(({ data }) => {
          setSession(data.session ?? null);
        })
        .finally(() => {
          if (timeoutId) clearTimeout(timeoutId);
          setLoading(false);
        });

      const {
        data: { subscription: authSubscription },
      } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (timeoutId) clearTimeout(timeoutId);
        setSession(nextSession);
        setLoading(false);
      });

      subscription = authSubscription;
    } catch {
      // Client creation failed despite env vars: stop waiting on the next tick.
      timeoutId = setTimeout(() => setLoading(false), 0);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id ?? null;

  const applyAccount = useCallback((uid: string, result: AccountResult) => {
    if (result.ok) {
      setAccount({ userId: uid, value: result.value });
      setAccountError(null);
      setCareAvailable(true);
      return;
    }
    const code = (result.error as { code?: string })?.code;
    if (code === "PGRST202" || code === "42883") {
      // Doctor features not installed yet: everyone is a patient, the rest of the app works as before.
      setAccount({ userId: uid, value: { role: "patient", doctor: null, patient: null } });
      setAccountError(null);
      setCareAvailable(false);
    } else {
      setAccountError({ userId: uid, message: careErrorMessage(result.error, "Couldn't load your account.") });
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchAccount().then((result) => {
      if (alive) applyAccount(userId, result);
    });
    return () => {
      alive = false;
    };
  }, [userId, applyAccount]);

  const value = useMemo<AuthContextValue>(() => {
    const current = account && account.userId === userId ? account.value : null;
    const error = accountError && accountError.userId === userId ? accountError.message : null;
    return {
      user: session?.user ?? null,
      session,
      loading,
      account: current,
      role: current?.role ?? null,
      roleLoading: loading || (Boolean(userId) && !current && !error),
      accountError: error,
      careAvailable,
      refreshAccount: async () => {
        if (userId) applyAccount(userId, await fetchAccount());
      },
      signOut: async () => {
        if (!SUPABASE_CONFIGURED) return;
        const supabase = getSupabaseBrowserClient();
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw signOutError;
      },
    };
  }, [account, accountError, applyAccount, careAvailable, loading, session, userId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
