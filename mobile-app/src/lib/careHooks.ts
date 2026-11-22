// Keeps care screens current without pull-to-refresh: reload on screen focus, when the app returns to the
// foreground, after a local change, on a server push (Supabase Realtime) and every few seconds as a fallback.

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "./auth";
import { doctorInbox, getCareLinks, onCareChanged, patientUnread, type CareLink } from "./care";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const remoteListeners = new Set<() => void>();
function onRemoteChange(fn: () => void): () => void {
  remoteListeners.add(fn);
  return () => {
    remoteListeners.delete(fn);
  };
}

/** Runs `load` now, whenever it changes, and on every refresh signal. Pass a useCallback'd loader. */
export function useLiveData(load: () => unknown, intervalMs = 20_000): void {
  const ref = useRef(load);
  useEffect(() => {
    ref.current = load;
  }, [load]);
  useEffect(() => {
    void ref.current();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      const run = () => void ref.current();
      const id = setInterval(() => {
        if (AppState.currentState === "active") run();
      }, intervalMs);
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") run();
      });
      const offLocal = onCareChanged(run);
      const offRemote = onRemoteChange(run);
      return () => {
        clearInterval(id);
        sub.remove();
        offLocal();
        offRemote();
      };
    }, [intervalMs]),
  );
}

/** The signed-in patient's care links; `active` is her current doctor (or null). */
export function useCareLinks() {
  const { user, role, careAvailable } = useAuth();
  const uid = user && role === "patient" && careAvailable ? user.id : null;
  const [state, setState] = useState<{ userId: string | null; links: CareLink[] | null; error: boolean }>({
    userId: null,
    links: null,
    error: false,
  });

  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      setState({ userId: uid, links: await getCareLinks(uid), error: false });
    } catch {
      setState((s) => ({ ...s, userId: uid, error: true }));
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
 * Badge number: unread doctor messages (patient) or inbox items (doctor). Also subscribes to Realtime and
 * re-broadcasts pushes so every open care screen refreshes.
 */
export function useCareBadge(): number {
  const { user, role, careAvailable } = useAuth();
  const key = user && role && careAvailable ? `${user.id}:${role}` : "";
  const [state, setState] = useState<{ key: string; count: number }>({ key: "", count: 0 });

  const load = useCallback(async () => {
    if (!user || !role || !careAvailable) return;
    try {
      const count = role === "doctor" ? (await doctorInbox()).length : (await patientUnread(user.id)).total;
      setState({ key: `${user.id}:${role}`, count });
    } catch {
      // keep the last value
    }
  }, [user, role, careAvailable]);

  // The badge lives in the tab bar, which stays mounted: refresh on an interval and on any signal.
  const ref = useRef(load);
  useEffect(() => {
    ref.current = load;
  }, [load]);
  useEffect(() => {
    void ref.current();
    const id = setInterval(() => {
      if (AppState.currentState === "active") void ref.current();
    }, 30_000);
    const offLocal = onCareChanged(() => void ref.current());
    const offRemote = onRemoteChange(() => void ref.current());
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void ref.current();
    });
    return () => {
      clearInterval(id);
      offLocal();
      offRemote();
      sub.remove();
    };
  }, [load]);

  useEffect(() => (key ? acquireRealtime(key) : undefined), [key]);

  return state.key === key ? state.count : 0;
}

// One Realtime channel per signed-in user, shared by every component that shows a badge (tab bar, Home…).
// Supabase returns the same channel object for the same name, and adding listeners to an already
// subscribed channel throws, so a second subscriber must reuse the first one's channel.
const channels = new Map<string, { channel: RealtimeChannel; users: number }>();

function acquireRealtime(key: string): () => void {
  const client = supabase;
  if (!client) return () => undefined;
  let entry = channels.get(key);
  if (!entry) {
    const remote = () => remoteListeners.forEach((fn) => fn());
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
