"use client";

import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useLiveData } from "@/components/care/hooks";
import { Avatar, Button, Pill, SendIcon, Spinner } from "@/components/care/ui";
import {
  careErrorMessage,
  doctorName,
  formatDateTime,
  listMessages,
  markThreadRead,
  sendMessage,
  timeAgo,
  VERDICT_COPY,
  type CareMessage,
} from "@/lib/care";

/**
 * Messages between a patient and her doctor: either about one record (recordId) or the general conversation.
 * New messages appear automatically; opening the thread marks the other side's messages as read.
 */
export function Thread({
  patientId,
  recordId = null,
  canWrite,
  disabledReason,
  placeholder = "Write a message…",
  emptyText = "No messages yet.",
  accent = "emerald",
  maxHeight = 420,
}: {
  patientId: string;
  recordId?: string | null;
  canWrite: boolean;
  disabledReason?: string;
  placeholder?: string;
  emptyText?: string;
  accent?: "emerald" | "sky";
  maxHeight?: number;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<CareMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const rows = await listMessages(patientId, recordId);
      setMessages(rows);
      setLoadError(null);
      if (user && rows.some((m) => m.author_id !== user.id && !m.read_at) && document.visibilityState === "visible") {
        await markThreadRead(patientId, recordId);
      }
    } catch (e) {
      setLoadError(careErrorMessage(e, "Couldn't load the messages."));
    }
  }, [patientId, recordId, user]);

  useLiveData(load, 15_000);

  useLayoutEffect(() => {
    const n = messages?.length ?? 0;
    if (n !== lastCount.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    lastCount.current = n;
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const msg = await sendMessage(patientId, body, recordId);
      setDraft("");
      setMessages((m) => [...(m ?? []), msg]);
    } catch (e) {
      setSendError(careErrorMessage(e, "Couldn't send the message."));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  const focusRing = accent === "sky" ? "focus:border-sky-400 focus:ring-sky-500/10 dark:focus:border-sky-700" : "focus:border-emerald-400 focus:ring-emerald-500/10 dark:focus:border-emerald-700";
  const mine = accent === "sky" ? "bg-sky-600 text-white" : "bg-emerald-600 text-white";

  return (
    <div className="flex flex-col">
      <div ref={listRef} className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight }} aria-live="polite">
        {messages === null && !loadError ? (
          <div className="flex items-center gap-2 py-4 text-sm text-zinc-500"><Spinner size={14} /> Loading messages…</div>
        ) : null}
        {loadError ? <p className="py-2 text-sm text-rose-600">{loadError}</p> : null}
        {messages && !messages.length ? <p className="py-3 text-sm text-zinc-500">{emptyText}</p> : null}
        {messages?.map((m) => {
          const own = m.author_id === user?.id;
          const name = m.author_role === "doctor" ? doctorName(m.author_name) : m.author_name;
          const verdict = m.verdict ? VERDICT_COPY[m.verdict] : null;
          return (
            <div key={m.id} className={`flex gap-2.5 ${own ? "flex-row-reverse" : ""}`}>
              {!own ? <Avatar name={m.author_name} size={30} tone={m.author_role === "doctor" ? "blue" : "green"} /> : null}
              <div className={`max-w-[85%] ${own ? "items-end text-right" : ""} flex flex-col`}>
                <div className={`mb-1 flex items-center gap-2 text-[11px] text-zinc-500 ${own ? "justify-end" : ""}`}>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">{own ? "You" : name}</span>
                  <span title={formatDateTime(m.created_at)}>{timeAgo(m.created_at)}</span>
                </div>
                {verdict ? (
                  <div className={`mb-1 ${own ? "self-end" : ""}`}>
                    <Pill tone={verdict.tone} dot>Review: {verdict.label}</Pill>
                  </div>
                ) : null}
                <div
                  className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-left text-sm leading-6 ${
                    own ? `${mine} rounded-tr-md` : "rounded-tl-md bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {m.body}
                </div>
                {own && m.read_at ? <span className="mt-0.5 text-[10px] text-zinc-400">Seen</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        {canWrite ? (
          <>
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                maxLength={4000}
                rows={2}
                placeholder={placeholder}
                aria-label="Message"
                className={`min-h-[44px] flex-1 resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-400 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950 ${focusRing}`}
              />
              <Button
                variant={accent === "sky" ? "sky" : "emerald"}
                onClick={() => void send()}
                loading={sending}
                disabled={!draft.trim()}
                aria-label="Send message"
                className="h-11 w-11 shrink-0 !px-0"
              >
                {sending ? null : <SendIcon size={17} />}
              </Button>
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
              <span>{sendError ? <span className="text-rose-600">{sendError}</span> : "Ctrl + Enter to send"}</span>
              {draft.length > 3500 ? <span>{4000 - draft.length} left</span> : null}
            </div>
          </>
        ) : disabledReason ? (
          <p className="rounded-xl bg-zinc-50 px-3 py-2.5 text-sm text-zinc-500 dark:bg-zinc-900">{disabledReason}</p>
        ) : null}
      </div>
    </div>
  );
}
