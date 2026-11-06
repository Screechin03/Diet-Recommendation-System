"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Inlined at build time. Without these, accounts are simply disabled (no session to wait for).
const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(SUPABASE_CONFIGURED);

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

  const value = useMemo<AuthContextValue>(() => {
    return {
      user: session?.user ?? null,
      session,
      loading,
      signOut: async () => {
        if (!SUPABASE_CONFIGURED) return;
        const supabase = getSupabaseBrowserClient();
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    };
  }, [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
