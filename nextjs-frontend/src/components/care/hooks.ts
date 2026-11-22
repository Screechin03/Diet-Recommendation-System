"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { doctorInbox, getCareLinks, patientUnread, type CareLink } from "@/lib/care";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";

/**
 * Calls `refresh` whenever care data may have changed: after an action on this device ("care:changed"),
 * when the server pushes a change ("care:remote"), when the window regains focus, and every `intervalMs`
 * while the page is visible (fallback if live updates are off).
 */
export function useCareRefresh(refresh: () => void, intervalMs = 20_000): void {
  const ref = useRef(refresh);
  useEffect(() => {
    ref.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const run = () => ref.current();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("care:changed", run);
    window.addEventListener("care:remote", run);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisible);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, intervalMs);
    return () => {
      window.removeEventListener("care:changed", run);
      window.removeEventListener("care:remote", run);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(id);
    };
  }, [intervalMs]);
}

/**
 * Runs `load` now (and again whenever its identity changes, i.e. its inputs changed), plus on every
 * refresh signal from useCareRefresh. Pass a useCallback'd loader.
 */
export function useLiveData(load: () => unknown, intervalMs = 20_000): void {
  const ref = useRef(load);
  useEffect(() => {
    ref.current = load;
  }, [load]);
  useEffect(() => {
    void ref.current();
  }, [load]);
  useCareRefresh(() => void ref.current(), intervalMs);
}

/** The signed-in patient's care links; `active` is her current doctor (or null). */
export function useCareLinks() {
  const { user, role } = useAuth();
  const [state, setState] = useState<{ userId: string | null; links: CareLink[] | null; error: string | null }>({
    userId: null,
    links: null,
    error: null,
  });
  const uid = user && role === "patient" ? user.id : null;

  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      const links = await getCareLinks(uid);
      setState({ userId: uid, links, error: null });
    } catch (e) {
      setState((s) => ({ ...s, userId: uid, error: e instanceof Error ? e.message : "error" }));
    }
  }, [uid]);

  useLiveData(reload, 60_000);

  const links = state.userId === uid ? state.links : null;
  return {
    links,
    active: links?.find((l) => l.status === "active") ?? null,
    loading: Boolean(uid) && links === null && !state.error,
    reload,
  };
}

/**
 * Number for the header badge: unread doctor messages (patient) or inbox items (doctor).
 * Also listens for server pushes and re-broadcasts them as "care:remote" so open pages refresh.
 */
export function useCareBadge(): number {
  const { user, role, careAvailable } = useAuth();
  const [state, setState] = useState<{ key: string; count: number }>({ key: "", count: 0 });
  const key = user && role && careAvailable ? `${user.id}:${role}` : "";

  const load = useCallback(async () => {
    if (!user || !role || !careAvailable) return;
    try {
      const count = role === "doctor" ? (await doctorInbox()).length : (await patientUnread(user.id)).total;
      setState({ key: `${user.id}:${role}`, count });
    } catch {
      // Keep the last value; the next refresh will try again.
    }
  }, [user, role, careAvailable]);

  useLiveData(load, 30_000);

  useEffect(() => (key ? acquireRealtime(key) : undefined), [key]);

  return state.key === key ? state.count : 0;
}

// One Realtime channel per signed-in user, shared by every component that shows a badge (header, home…).
// Supabase returns the same channel object for the same name, and adding listeners to an already
// subscribed channel throws, so a second subscriber must reuse the first one's channel.
const channels = new Map<string, { channel: RealtimeChannel; users: number }>();

function acquireRealtime(key: string): () => void {
  let client: ReturnType<typeof getSupabaseBrowserClient>;
  try {
    client = getSupabaseBrowserClient();
  } catch {
    return () => undefined;
  }
  let entry = channels.get(key);
  if (!entry) {
    const remote = () => window.dispatchEvent(new Event("care:remote"));
    const channel = client
      .channel(`care-${key}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "care_messages" }, remote)
      .on("postgres_changes", { event: "*", schema: "public", table: "care_links" }, remote)
      .subscribe();
    entry = { channel, users: 0 };
    channels.set(key, entry);
  }
  entry.users += 1;
  const mine = entry;
  return () => {
    mine.users -= 1;
    // Close a moment later, so an immediate remount (React dev mode, navigation) reuses the channel.
    setTimeout(() => {
      if (mine.users <= 0 && channels.get(key) === mine) {
        channels.delete(key);
        void client.removeChannel(mine.channel);
      }
    }, 1000);
  };
}
