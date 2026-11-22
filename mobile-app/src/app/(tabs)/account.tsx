import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AuthHeader, Body, Button, Card, Disclaimer, InfoBox, PageHeader, Screen, Section, Stat } from "@/components/ui";
import { SectionTitle, ToolList } from "@/components/Widgets";
import { Avatar, RecordRow } from "@/components/Care";
import { DietSummary } from "@/components/CareRecord";
import { elevation, type as typo, useTheme } from "@/components/theme";
import { useAuth } from "@/lib/auth";
import { useCareLinks, useLiveData } from "@/lib/careHooks";
import { confirmAction } from "@/lib/confirm";
import {
  careErrorMessage,
  doctorName,
  endCare,
  initials,
  getDietInstructions,
  hasDietInstructions,
  listRecords,
  patientUnread,
  type DietInstructions,
  type RecordSummary,
} from "@/lib/care";

export default function CareTab() {
  const t = useTheme();
  const { user, loading, enabled, role, careAvailable, account, signOut } = useAuth();

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={t.primary} />
      </Screen>
    );
  }
  if (!enabled) {
    return (
      <Screen>
        <InfoBox>Accounts aren’t configured in this build (missing Supabase settings).</InfoBox>
      </Screen>
    );
  }
  if (!user) {
    return (
      <Screen safeTop>
        <AuthHeader title="My care" subtitle="Log in to keep your reports and readings, share them with your doctor and get their reviews." />
        <Button title="Log in" onPress={() => router.push("/login")} />
        <Button title="Create account" variant="secondary" onPress={() => router.push("/signup")} />
        <Pressable onPress={() => router.push("/doctor-login")} accessibilityRole="link" style={{ alignSelf: "center", padding: 8 }}>
          <Text style={{ color: t.info, fontWeight: "700" }}>Are you a doctor? Doctor login</Text>
        </Pressable>
        <Disclaimer />
      </Screen>
    );
  }
  if (role === "doctor") return null; // the tab layout redirects doctors to their own tabs

  const name = account?.patient?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? null;
  return (
    <Screen safeTop>
      <PageHeader eyebrow="My care" title="Records & doctor" />
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={[st.me, { backgroundColor: t.primary }]}>
          <Text style={{ color: t.onPrimary, fontSize: 20, fontWeight: "800" }}>{name ? initials(name) : "?"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typo.headline, { color: t.text }]} numberOfLines={1}>{name ?? "Your account"}</Text>
          <Text style={{ color: t.muted, fontSize: 13.5 }} numberOfLines={1}>{user.email}</Text>
          {account?.patient?.pregnancy_month ? (
            <Text style={{ color: t.primary, fontSize: 12.5, fontWeight: "700", marginTop: 3 }}>Month {account.patient.pregnancy_month} of 9</Text>
          ) : null}
        </View>
      </Card>
      {careAvailable ? <CareHome userId={user.id} /> : <InfoBox>Doctor features aren’t set up on the server yet.</InfoBox>}
      <SectionTitle>Account</SectionTitle>
      <ToolList
        items={[
          { icon: "heart-outline", title: "Saved recipes", text: "Meals you’ve kept for later", href: "/saved" },
          { icon: "time-outline", title: "Recommendation history", text: "Every plan you’ve generated", href: "/history" },
        ]}
      />
      <Button title="Log out" variant="danger" icon="log-out-outline" onPress={() => signOut().catch(() => {})} />
      <Disclaimer />
    </Screen>
  );
}

function CareHome({ userId }: { userId: string }) {
  const t = useTheme();
  const { links, active, loading } = useCareLinks();
  const [records, setRecords] = useState<RecordSummary[] | null>(null);
  const [unread, setUnread] = useState<{ total: number; byRecord: Record<string, number> }>({ total: 0, byRecord: {} });
  const [diet, setDiet] = useState<DietInstructions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, u, d] = await Promise.all([listRecords(userId), patientUnread(userId), getDietInstructions(userId)]);
      setRecords(r);
      setUnread(u);
      setDiet(d);
      setError(null);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load your records."));
    }
  }, [userId]);
  useLiveData(load);

  const doctor = active?.doctor ?? null;
  const past = (links ?? []).filter((l) => l.status === "ended");
  const awaiting = (records ?? []).filter((r) => r.review_status === "requested").length;
  const reviewed = (records ?? []).filter((r) => r.review_status === "reviewed").length;

  async function end() {
    if (!active) return;
    const ok = await confirmAction(
      "End care?",
      `${doctorName(active.doctor?.full_name)} will stop seeing your records straight away. Your records stay with you.`,
      "End care",
    );
    if (!ok) return;
    setEnding(true);
    try {
      await endCare(active.id, null);
    } catch (e) {
      setError(careErrorMessage(e));
    } finally {
      setEnding(false);
    }
  }

  return (
    <>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Stat label="Records" value={records ? String(records.length) : "–"} tone="rose" />
        <Stat label="Awaiting" value={records ? String(awaiting) : "–"} caption="doctor review" />
        <Stat label="Reviewed" value={records ? String(reviewed) : "–"} caption={unread.total ? `${unread.total} unread` : "all read"} />
      </View>
      {loading ? (
        <ActivityIndicator color={t.primary} />
      ) : doctor ? (
        <Card style={{ gap: 16 }}>
          <Text style={[st.eyebrow, { color: t.muted }]}>YOUR DOCTOR</Text>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Avatar name={doctor.full_name} size={50} doctor />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 18, fontWeight: "800" }}>{doctorName(doctor.full_name)}</Text>
              <Text style={{ color: t.muted }}>{[doctor.specialty, doctor.hospital, doctor.city].filter(Boolean).join(" · ")}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => router.push("/care/messages")}
            accessibilityRole="button"
            style={({ pressed }) => [st.msgRow, { backgroundColor: t.primaryTint, opacity: pressed ? 0.85 : 1 }]}
          >
            <Ionicons name="chatbubbles-outline" size={20} color={t.primary} />
            <Text style={{ color: t.text, fontWeight: "700", flex: 1 }}>Messages with {doctorName(doctor.full_name)}</Text>
            {unread.byRecord.general ? (
              <View style={[st.badge, { backgroundColor: t.primary }]}><Text style={st.badgeText}>{unread.byRecord.general}</Text></View>
            ) : (
              <Ionicons name="chevron-forward" size={18} color={t.muted} />
            )}
          </Pressable>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Button title="Change doctor" variant="secondary" onPress={() => router.push("/care/doctors")} /></View>
            <View style={{ flex: 1 }}><Button title="End care" variant="danger" onPress={end} loading={ending} /></View>
          </View>
        </Card>
      ) : (
        <Section icon="medkit-outline" title="Choose your doctor" subtitle="Change doctor at any time">
          <Body muted>Your doctor sees your records as soon as you save them, reviews them and can message you.</Body>
          <Button title="Find a doctor" icon="search" onPress={() => router.push("/care/doctors")} />
        </Section>
      )}

      {hasDietInstructions(diet) ? (
        <Section icon="nutrition-outline" title="Diet instructions" subtitle={`From ${doctorName(diet.updated_by_name)} · applied to your Diet Plan automatically`}>
          <DietSummary d={diet} />
        </Section>
      ) : null}

      <SectionTitle>Your records</SectionTitle>
      <View style={{ gap: 10 }}>
        {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
        {records === null && !error ? <ActivityIndicator color={t.primary} /> : null}
        {records && !records.length ? (
          <InfoBox>No records yet. Scan a report, check your vitals or risk, or make a diet plan, then choose “Save”.</InfoBox>
        ) : null}
        {records?.map((r) => (
          <RecordRow key={r.id} record={r} unread={unread.byRecord[r.id] ?? 0} href={{ pathname: "/care/record/[id]", params: { id: r.id } }} />
        ))}
      </View>

      {past.length ? (
        <Section icon="people-outline" title="Previous doctors" subtitle="Your new doctor can see their notes">
          {past.map((l) => (
            <View key={l.id} style={{ gap: 2 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>{doctorName(l.doctor?.full_name)}</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>
                {new Date(l.started_at).toLocaleDateString()} – {l.ended_at ? new Date(l.ended_at).toLocaleDateString() : ""}
                {l.ended_by === "doctor" ? " · ended by the doctor" : ""}
                {l.end_reason ? ` · ${l.end_reason}` : ""}
              </Text>
            </View>
          ))}
        </Section>
      ) : null}
    </>
  );
}

const st = StyleSheet.create({
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.6 },
  msgRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, padding: 14 },
  me: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
