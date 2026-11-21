// Care-team building blocks for the app: badges, record rows, the conversation thread and the
// "share with your doctor" panel shown under each tool result. Mirrors nextjs-frontend/src/components/care.
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, type Href } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme, type Theme } from "./theme";
import { useAuth } from "@/lib/auth";
import { useCareLinks, useLiveData } from "@/lib/careHooks";
import {
  careErrorMessage,
  doctorName,
  initials,
  KIND_COPY,
  listMessages,
  markThreadRead,
  requestReview,
  saveRecord,
  sendMessage,
  SEVERITY_COPY,
  timeAgo,
  VERDICT_COPY,
  type CareMessage,
  type NewRecord,
  type RecordKind,
  type RecordSummary,
  type Severity,
} from "@/lib/care";
import type { PickedFile } from "@/lib/types";

type IconName = ComponentProps<typeof Ionicons>["name"];
export type Tone = "green" | "amber" | "red" | "gray" | "blue";

export function toneColors(t: Theme, tone: Tone): { bg: string; fg: string } {
  switch (tone) {
    case "green":
      return { bg: t.successSoft, fg: t.success };
    case "amber":
      return { bg: t.warnSoft, fg: t.warn };
    case "red":
      return { bg: t.dangerSoft, fg: t.danger };
    case "blue":
      return { bg: t.infoSoft, fg: t.info };
    default:
      return { bg: t.muted2, fg: t.muted };
  }
}

export function Pill({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  const t = useTheme();
  const c = toneColors(t, tone);
  return (
    <View style={[s.pill, { backgroundColor: c.bg }]}>
      <Text style={{ color: c.fg, fontSize: 11, fontWeight: "700" }}>{children}</Text>
    </View>
  );
}

export function Avatar({ name, size = 40, doctor }: { name: string | null | undefined; size?: number; doctor?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: doctor ? t.infoSoft : t.primarySoft }}>
      <Text style={{ color: doctor ? t.info : t.primary, fontWeight: "800", fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

export function ReviewPill({ record, doctorView }: { record: Pick<RecordSummary, "review_status" | "verdict">; doctorView?: boolean }) {
  if (record.review_status === "requested") return <Pill tone="blue">{doctorView ? "Review requested" : "Awaiting review"}</Pill>;
  if (record.review_status === "reviewed" && record.verdict) {
    const v = VERDICT_COPY[record.verdict];
    return <Pill tone={v.tone}>✓ {v.label}</Pill>;
  }
  return null;
}

export function SeverityPill({ severity }: { severity: Severity }) {
  const c = SEVERITY_COPY[severity];
  return <Pill tone={c.tone}>{c.label}</Pill>;
}

const KIND_ICON: Record<RecordKind, IconName> = {
  report: "document-text-outline",
  vitals: "pulse-outline",
  risk: "shield-checkmark-outline",
  diet_plan: "nutrition-outline",
};

export function KindIcon({ kind, size = 40 }: { kind: RecordKind; size?: number }) {
  const t = useTheme();
  const tone: Tone = kind === "vitals" ? "red" : kind === "risk" ? "amber" : kind === "diet_plan" ? "green" : "blue";
  const c = toneColors(t, tone);
  return (
    <View style={{ width: size, height: size, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}>
      <Ionicons name={KIND_ICON[kind]} size={size * 0.5} color={c.fg} />
    </View>
  );
}

export function RecordRow({ record, href, unread = 0, doctorView }: { record: RecordSummary; href: Href; unread?: number; doctorView?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      style={({ pressed }) => [s.row, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <KindIcon kind={record.kind} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={1} style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>{record.title}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {record.severity === "urgent" || record.severity === "attention" ? <SeverityPill severity={record.severity} /> : null}
          <ReviewPill record={record} doctorView={doctorView} />
          {record.is_sample ? <Pill>Sample</Pill> : null}
        </View>
        <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>
          {timeAgo(record.created_at)} · {KIND_COPY[record.kind].label}
          {record.summary ? ` · ${record.summary}` : ""}
        </Text>
      </View>
      {unread ? (
        <View style={[s.badge, { backgroundColor: t.danger }]}>
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{unread}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={t.muted} />
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------------------

export function Thread({
  patientId,
  recordId = null,
  canWrite,
  disabledReason,
  placeholder = "Write a message…",
  emptyText = "No messages yet.",
  doctorAccent,
}: {
  patientId: string;
  recordId?: string | null;
  canWrite: boolean;
  disabledReason?: string;
  placeholder?: string;
  emptyText?: string;
  doctorAccent?: boolean;
}) {
  const t = useTheme();
  const { user } = useAuth();
  const [messages, setMessages] = useState<CareMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await listMessages(patientId, recordId);
      setMessages(rows);
      setError(null);
      if (user && rows.some((m) => m.author_id !== user.id && !m.read_at)) await markThreadRead(patientId, recordId);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load the messages."));
    }
  }, [patientId, recordId, user]);
  useLiveData(load, 15_000);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await sendMessage(patientId, body, recordId);
      setDraft("");
      setMessages((m) => [...(m ?? []), msg]);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't send the message."));
    } finally {
      setSending(false);
    }
  }

  const accent = doctorAccent ? t.info : t.primary;
  return (
    <View style={{ gap: 10 }}>
      {messages === null && !error ? <ActivityIndicator color={accent} /> : null}
      {messages && !messages.length ? <Text style={{ color: t.muted }}>{emptyText}</Text> : null}
      {messages?.map((m) => {
        const own = m.author_id === user?.id;
        const verdict = m.verdict ? VERDICT_COPY[m.verdict] : null;
        return (
          <View key={m.id} style={{ alignItems: own ? "flex-end" : "flex-start", gap: 4 }}>
            <Text style={{ color: t.muted, fontSize: 11 }}>
              {own ? "You" : m.author_role === "doctor" ? doctorName(m.author_name) : m.author_name} · {timeAgo(m.created_at)}
            </Text>
            {verdict ? <Pill tone={verdict.tone}>Review: {verdict.label}</Pill> : null}
            <View style={[s.bubble, own ? { backgroundColor: accent, borderTopRightRadius: 4 } : { backgroundColor: t.muted2, borderTopLeftRadius: 4 }]}>
              <Text style={{ color: own ? t.onPrimary : t.text, fontSize: 15, lineHeight: 21 }}>{m.body}</Text>
            </View>
            {own && m.read_at ? <Text style={{ color: t.muted, fontSize: 10 }}>Seen</Text> : null}
          </View>
        );
      })}
      {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
      {canWrite ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor={t.muted}
            multiline
            maxLength={4000}
            accessibilityLabel="Message"
            style={[s.input, { backgroundColor: t.input, borderColor: t.border, color: t.text }]}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={[s.send, { backgroundColor: accent, opacity: !draft.trim() || sending ? 0.5 : 1 }]}
          >
            {sending ? <ActivityIndicator color={t.onPrimary} /> : <Ionicons name="send" size={18} color={t.onPrimary} />}
          </Pressable>
        </View>
      ) : disabledReason ? (
        <Text style={{ color: t.muted, fontSize: 13 }}>{disabledReason}</Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------

function SmallButton({ title, onPress, primary, loading, disabled }: { title: string; onPress: () => void; primary?: boolean; loading?: boolean; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.smallBtn,
        { backgroundColor: primary ? t.primary : t.card, borderColor: primary ? t.primary : t.border, opacity: disabled || loading ? 0.55 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={primary ? t.onPrimary : t.primary} /> : <Text style={{ color: primary ? t.onPrimary : t.text, fontWeight: "700" }}>{title}</Text>}
    </Pressable>
  );
}

/**
 * Under each tool result: save it (the patient's doctor sees it automatically) and optionally ask for a review.
 * Without a doctor, "Save & choose a doctor" saves first so nothing is lost. Give it a new `key` per result.
 */
export function ShareWithDoctor({
  build,
  file,
  what = "this result",
  onSaved,
}: {
  build: () => NewRecord;
  file?: PickedFile | null;
  what?: string;
  onSaved?: (r: RecordSummary) => void;
}) {
  const t = useTheme();
  const { user, role, roleLoading, careAvailable, enabled } = useAuth();
  const { active, loading } = useCareLinks();
  const [saved, setSaved] = useState<RecordSummary | null>(null);
  const [busy, setBusy] = useState<null | "save" | "review">(null);
  const [error, setError] = useState<string | null>(null);
  const buildRef = useRef(build);
  useEffect(() => {
    buildRef.current = build;
  }, [build]);

  if (!enabled || roleLoading || role === "doctor" || (user && !careAvailable)) return null;
  const doctor = active?.doctor ?? null;
  const dr = doctor ? doctorName(doctor.full_name) : null;

  async function save(withReview: boolean, thenChoose = false) {
    if (!user) return;
    setBusy(withReview ? "review" : "save");
    setError(null);
    try {
      const rec = await saveRecord(user.id, { ...buildRef.current(), requestReview: withReview }, file);
      setSaved(rec);
      onSaved?.(rec);
      if (thenChoose) router.push({ pathname: "/care/doctors", params: { next: `/care/record/${rec.id}` } });
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't save this. Please try again."));
    } finally {
      setBusy(null);
    }
  }

  async function ask() {
    if (!saved) return;
    setBusy("review");
    setError(null);
    try {
      setSaved(await requestReview(saved.id, null));
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't send the request."));
    } finally {
      setBusy(null);
    }
  }

  let body: ReactNode;
  if (!user) {
    body = (
      <>
        <Text style={[s.shareTitle, { color: t.text }]}>Keep {what} and share it with your doctor</Text>
        <Text style={{ color: t.muted }}>Log in to save it. Your doctor sees it on their dashboard and can reply.</Text>
        <View style={s.btnRow}>
          <SmallButton primary title="Log in" onPress={() => router.push("/login")} />
          <SmallButton title="Create account" onPress={() => router.push("/signup")} />
        </View>
      </>
    );
  } else if (saved) {
    const requested = saved.review_status === "requested";
    body = (
      <>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Ionicons name="checkmark-circle" size={20} color={t.success} />
          <Text style={[s.shareTitle, { color: t.text }]}>Saved to your records</Text>
          {requested ? <Pill tone="blue">Review requested</Pill> : null}
        </View>
        <Text style={{ color: t.muted }}>
          {doctor ? (requested ? `${dr} has been asked to review it.` : `${dr} can see it on their dashboard.`) : "Choose a doctor to have it reviewed."}
        </Text>
        <View style={s.btnRow}>
          {doctor && !requested ? <SmallButton primary title={`Ask ${dr} to review`} onPress={ask} loading={busy === "review"} /> : null}
          {!doctor ? (
            <SmallButton primary title="Choose a doctor" onPress={() => router.push({ pathname: "/care/doctors", params: { next: `/care/record/${saved.id}` } })} />
          ) : null}
          <SmallButton title="Open record" onPress={() => router.push({ pathname: "/care/record/[id]", params: { id: saved.id } })} />
        </View>
      </>
    );
  } else if (loading) {
    body = <ActivityIndicator color={t.primary} />;
  } else {
    body = (
      <>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {doctor ? <Avatar name={doctor.full_name} size={36} doctor /> : <Ionicons name="medkit-outline" size={24} color={t.info} />}
          <Text style={[s.shareTitle, { color: t.text, flex: 1 }]}>{doctor ? `Share with ${dr}` : `Get ${what} reviewed by a doctor`}</Text>
        </View>
        <Text style={{ color: t.muted }}>
          {doctor ? `Saved records appear on ${dr}'s dashboard.` : "Save it and choose a doctor. They'll see it straight away and can reply."}
        </Text>
        <View style={s.btnRow}>
          <SmallButton primary title={doctor ? "Save & ask for review" : "Save & choose a doctor"} onPress={() => save(true, !doctor)} loading={busy === "review"} disabled={busy !== null} />
          <SmallButton title="Just save" onPress={() => save(false)} loading={busy === "save"} disabled={busy !== null} />
        </View>
      </>
    );
  }

  return (
    <View style={[s.share, { backgroundColor: saved ? t.successSoft : t.card, borderColor: saved ? t.success : t.border }]}>
      {body}
      {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 12 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  bubble: { maxWidth: "88%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  input: { flex: 1, minHeight: 46, maxHeight: 140, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, fontSize: 15 },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  share: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 },
  shareTitle: { fontSize: 16, fontWeight: "800" },
  btnRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallBtn: { minHeight: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
});
