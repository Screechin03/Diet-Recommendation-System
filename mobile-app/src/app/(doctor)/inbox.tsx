import { useCallback, useState, type ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Body, ErrorBox, H1, Screen } from "@/components/ui";
import { Pill, toneColors, type Tone } from "@/components/Care";
import { useTheme } from "@/components/theme";
import { useAuth } from "@/lib/auth";
import { useLiveData } from "@/lib/careHooks";
import { careErrorMessage, doctorInbox, doctorName, doctorPatients, KIND_COPY, timeAgo, type DoctorPatientRow, type InboxItem } from "@/lib/care";

type IconName = ComponentProps<typeof Ionicons>["name"];

const STYLE: Record<InboxItem["item_type"], { icon: IconName; tone: Tone }> = {
  urgent: { icon: "alert-circle-outline", tone: "red" },
  review: { icon: "time-outline", tone: "blue" },
  message: { icon: "chatbubbles-outline", tone: "amber" },
  new_patient: { icon: "person-add-outline", tone: "green" },
};

function title(i: InboxItem): string {
  if (i.item_type === "urgent") return `Urgent: ${i.record_title ?? "result"}`;
  if (i.item_type === "review") return `Review requested: ${i.record_title ?? "record"}`;
  if (i.item_type === "message") return `${i.item_count} new message${i.item_count === 1 ? "" : "s"}${i.record_title ? ` on “${i.record_title}”` : ""}`;
  return "New patient chose you";
}

function href(i: InboxItem): Href {
  if (i.record_id) return { pathname: "/doctor/record/[id]", params: { id: i.record_id } };
  return { pathname: "/doctor/patient/[id]", params: { id: i.patient_id, tab: i.item_type === "message" ? "messages" : "records" } };
}

export default function DoctorInboxScreen() {
  const t = useTheme();
  const { account } = useAuth();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [patients, setPatients] = useState<DoctorPatientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [i, p] = await Promise.all([doctorInbox(), doctorPatients()]);
      setItems(i);
      setPatients(p);
      setError(null);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load your inbox."));
    }
  }, []);
  useLiveData(load, 20_000);

  const active = (patients ?? []).filter((p) => p.status === "active");
  const stats: Array<[string, number, Tone]> = [
    ["Patients", active.length, "gray"],
    ["To review", active.reduce((n, p) => n + p.pending_reviews, 0), "blue"],
    ["Urgent", active.reduce((n, p) => n + p.urgent_pending, 0), "red"],
    ["Unread", active.reduce((n, p) => n + p.unread_messages, 0), "amber"],
  ];

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Text style={{ color: t.info, fontWeight: "800", letterSpacing: 1.6, fontSize: 11 }}>
          {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}
        </Text>
        <H1>{doctorName(account?.doctor?.full_name)}</H1>
      </View>
      <View style={st.stats}>
        {stats.map(([label, n, tone]) => {
          const c = toneColors(t, tone);
          return (
            <View key={label} style={[st.stat, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={{ color: tone === "gray" ? t.text : c.fg, fontSize: 24, fontWeight: "800" }}>{patients ? n : "–"}</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
            </View>
          );
        })}
      </View>
      <ErrorBox message={error} />
      {items === null && !error ? <ActivityIndicator color={t.info} /> : null}
      {items && !items.length ? (
        <View style={[st.empty, { borderColor: t.border }]}>
          <Ionicons name="checkmark-circle-outline" size={36} color={t.success} />
          <Text style={{ color: t.text, fontWeight: "800", fontSize: 16 }}>You’re all caught up</Text>
          <Body muted>
            {active.length
              ? "Review requests, urgent results and messages appear here."
              : "When a patient chooses you as her doctor, she appears here."}
          </Body>
        </View>
      ) : null}
      {items?.map((i, idx) => {
        const sty = STYLE[i.item_type];
        const c = toneColors(t, sty.tone);
        return (
          <Pressable
            key={`${i.item_type}-${i.patient_id}-${i.record_id ?? "g"}-${idx}`}
            onPress={() => router.push(href(i))}
            accessibilityRole="button"
            style={({ pressed }) => [st.item, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={[st.icon, { backgroundColor: c.bg }]}>
              <Ionicons name={sty.icon} size={20} color={c.fg} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: t.text, fontWeight: "800" }} numberOfLines={2}>{title(i)}</Text>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <Text style={{ color: t.muted, fontSize: 12 }}>{i.patient_name} · {timeAgo(i.at)}</Text>
                {i.record_kind ? <Pill>{KIND_COPY[i.record_kind].label}</Pill> : null}
              </View>
              {i.preview ? <Text style={{ color: t.muted }} numberOfLines={2}>“{i.preview}”</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const st = StyleSheet.create({
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  empty: { borderWidth: 1, borderStyle: "dashed", borderRadius: 16, padding: 24, alignItems: "center", gap: 6 },
  item: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 16, padding: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
