// Medicine safety checker for the app: results view, name search, editable list and the panel shown after a
// prescription scan. Same data as the website's components/meds.
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { elevation, useTheme } from "./theme";
import { Card, Chips, SectionLabel } from "./ui";
import { Pill, toneColors, type Tone } from "./Care";
import { useAuth } from "@/lib/auth";
import { careErrorMessage } from "@/lib/care";
import {
  addMyMedicines,
  checkMedicines,
  searchMedicines,
  STATUS_COPY,
  TIER_COPY,
  type MedCheckResult,
  type MedicineEntry,
  type MedInteraction,
  type MedResult,
  type MedSuggestion,
  type MedTier,
} from "@/lib/meds";

type IconName = ComponentProps<typeof Ionicons>["name"];

function TierPill({ tier }: { tier: MedTier }) {
  return <Pill tone={TIER_COPY[tier].tone as Tone}>{TIER_COPY[tier].short}</Pill>;
}

function Trimesters({ tiers, current }: { tiers: Record<"t1" | "t2" | "t3", MedTier>; current: number | null }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {(["t1", "t2", "t3"] as const).map((k, i) => (
        <View key={k} style={[s.tri, { backgroundColor: t.muted2, borderColor: current === i + 1 ? t.text : "transparent" }]}>
          <View style={[s.dot, { backgroundColor: toneColors(t, TIER_COPY[tiers[k]].tone as Tone).fg }]} />
          <Text style={{ color: t.muted, fontSize: 10, fontWeight: "700" }}>T{i + 1}</Text>
        </View>
      ))}
    </View>
  );
}

function MedicineCard({ m, trimester }: { m: MedResult; trimester: number | null }) {
  const t = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "800", fontSize: 16 }}>{m.label}</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>
            {m.input.toLowerCase() !== m.label.toLowerCase() ? `“${m.input}” · ` : ""}
            {[m.dose, m.frequency].filter(Boolean).join(" · ")}
            {m.match_confidence === "fuzzy" ? " · similar spelling, please check" : ""}
          </Text>
        </View>
        <TierPill tier={m.tier} />
      </View>
      {m.matched ? (
        m.ingredients.map((g) => (
          <View key={g.id} style={{ gap: 6 }}>
            {m.ingredients.length > 1 ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: t.text, fontWeight: "700", flex: 1 }}>{g.name}</Text>
                <TierPill tier={g.tier} />
              </View>
            ) : null}
            <Text style={{ color: t.text, lineHeight: 21 }}>{g.note}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Trimesters tiers={g.by_trimester} current={trimester} />
              <Text style={{ color: t.muted, fontSize: 11, flexShrink: 1 }}>Source: {g.source}</Text>
            </View>
          </View>
        ))
      ) : m.label_info ? (
        <Text style={{ color: t.text }}>From the drug label: {TIER_COPY[m.label_info.tier].label.toLowerCase()} ({m.label_info.source})</Text>
      ) : (
        <Text style={{ color: t.muted }}>We couldn’t identify this medicine. Check the spelling, or ask your doctor or pharmacist.</Text>
      )}
      {m.model?.risk ? (
        <Text style={{ color: t.muted, fontSize: 12 }}>
          Research model estimate (not verified):{" "}
          {Object.entries(m.model.risk).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${TIER_COPY[k as MedTier]?.short ?? k} ${Math.round(v * 100)}%`).join(" · ")}
        </Text>
      ) : null}
      {m.dont_stop && m.tier !== "generally_used" ? (
        <Text style={{ color: t.danger, fontWeight: "700", fontSize: 13 }}>Don’t stop this medicine on your own. Talk to your doctor first.</Text>
      ) : null}
    </Card>
  );
}

function InteractionRow({ x, result }: { x: MedInteraction; result: MedCheckResult }) {
  const t = useTheme();
  const color = x.origin === "model" ? t.info : x.severity === "avoid" ? t.danger : x.severity === "caution" ? t.warn : t.info;
  const icon: IconName = x.severity === "timing" ? "time-outline" : x.origin === "model" ? "information-circle-outline" : "warning-outline";
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <Ionicons name={icon} size={20} color={color} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontWeight: "700" }}>{result.medicines[x.a]?.label} + {result.medicines[x.b]?.label}</Text>
        <Text style={{ color: t.text, lineHeight: 20 }}>{x.effect} {x.advice}</Text>
        <Text style={{ color: t.muted, fontSize: 11 }}>{x.origin === "model" ? `Unverified model signal · ` : ""}{x.source}</Text>
      </View>
    </View>
  );
}

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <Card>
      <SectionLabel>{title}</SectionLabel>
      {note ? <Text style={{ color: t.muted, fontSize: 12 }}>{note}</Text> : null}
      <View style={{ gap: 14 }}>{children}</View>
    </Card>
  );
}

export function MedCheckView({ result, compact = false }: { result: MedCheckResult; compact?: boolean }) {
  const t = useTheme();
  const st = STATUS_COPY[result.status];
  const c = toneColors(t, st.tone as Tone);
  const checked = result.interactions.filter((x) => x.origin !== "model");
  const serious = checked.filter((x) => x.severity !== "timing");
  const timing = checked.filter((x) => x.severity === "timing");
  const model = result.interactions.filter((x) => x.origin === "model");
  const stop = result.medicines.filter((m) => m.dont_stop && m.tier !== "generally_used");
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.banner, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.fg, fontWeight: "800", fontSize: 12, letterSpacing: 0.8 }}>
          {st.label.toUpperCase()}
          {result.pregnancy_month ? ` · MONTH ${result.pregnancy_month}` : ""}
        </Text>
        <Text style={{ color: t.text, fontWeight: "800", fontSize: 18 }}>{result.headline}</Text>
      </View>
      {stop.length ? (
        <View style={[s.banner, { backgroundColor: t.dangerSoft }]}>
          <Text style={{ color: t.danger, fontWeight: "700" }}>
            Don’t stop {stop.map((m) => m.label).join(", ")} suddenly. Ask your doctor about switching.
          </Text>
        </View>
      ) : null}
      {result.medicines.map((m) => <MedicineCard key={m.index} m={m} trimester={result.trimester} />)}
      {serious.length ? (
        <Block title="Combinations to check with your doctor">{serious.map((x, i) => <InteractionRow key={i} x={x} result={result} />)}</Block>
      ) : null}
      {timing.length ? (
        <Block title="Take these apart" note="Fine together, but one stops the other being absorbed.">{timing.map((x, i) => <InteractionRow key={i} x={x} result={result} />)}</Block>
      ) : null}
      {!compact && result.schedule.slots.length ? (
        <Block title="Your daily timing plan" note="A suggestion that keeps the gaps above. Always follow your prescription.">
          {result.schedule.slots.map((slot) => (
            <View key={slot.slot} style={{ flexDirection: "row", gap: 12 }}>
              <Text style={{ color: t.primary, fontWeight: "800", width: 48 }}>{slot.time}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.muted, fontSize: 12 }}>{slot.label}</Text>
                {slot.items.map((it) => (
                  <Text key={it.index} style={{ color: t.text }}>
                    <Text style={{ fontWeight: "700" }}>{it.label}</Text>
                    {it.food ? <Text style={{ color: t.muted }}> · {it.food}</Text> : null}
                  </Text>
                ))}
              </View>
            </View>
          ))}
          {result.schedule.as_needed.length ? <Text style={{ color: t.muted }}>Only when needed: {result.schedule.as_needed.map((x) => x.label).join(", ")}</Text> : null}
          {result.schedule.notes.map((n) => <Text key={n} style={{ color: t.muted, fontSize: 12 }}>{n}</Text>)}
        </Block>
      ) : null}
      {model.length ? (
        <Block title="Research model signals (not verified)" note="Predicted by our graph model; not checked by a clinician.">
          {model.map((x, i) => <InteractionRow key={i} x={x} result={result} />)}
        </Block>
      ) : null}
      <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>{result.disclaimer}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------

export function MedicineSearch({ onAdd }: { onAdd: (name: string) => void }) {
  const t = useTheme();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MedSuggestion[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      searchMedicines(q, ctrl.signal).then(setItems).catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);
  const shown = q.trim().length >= 2 ? items : [];
  const add = (name: string) => {
    if (!name.trim()) return;
    onAdd(name.trim());
    setQ("");
    setItems([]);
  };
  return (
    <View style={{ gap: 6 }}>
      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => add(q)}
        returnKeyType="done"
        placeholder="Add a medicine: brand or generic name"
        placeholderTextColor={t.muted}
        autoCapitalize="none"
        style={[s.input, { backgroundColor: t.input, borderColor: t.border, color: t.text }]}
      />
      {shown.length ? (
        <View style={[s.suggest, { backgroundColor: t.card, borderColor: t.hairline }]}>
          {shown.slice(0, 6).map((sug) => (
            <Pressable key={`${sug.kind}-${sug.name}`} onPress={() => add(sug.name)} style={s.suggestRow} accessibilityRole="button">
              <Text style={{ color: t.text, fontWeight: "700" }}>{sug.name}</Text>
              <Text style={{ color: t.muted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>{sug.kind === "product" ? sug.detail : "generic"}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => add(q)} style={s.suggestRow} accessibilityRole="button">
            <Text style={{ color: t.muted }}>Add “{q.trim()}” as typed</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export interface EditableMedicine extends MedicineEntry {
  key: string;
  id?: string;
  dirty?: boolean;
}

export function MedicineRows({ items, onChange, onRemove }: { items: EditableMedicine[]; onChange: (key: string, patch: Partial<MedicineEntry>) => void; onRemove: (key: string) => void }) {
  const t = useTheme();
  if (!items.length) return <Text style={{ color: t.muted }}>No medicines yet. Add the ones you take, including vitamins and supplements.</Text>;
  const small = [s.small, { backgroundColor: t.input, borderColor: t.border, color: t.text }];
  return (
    <View style={{ gap: 8 }}>
      {items.map((m) => (
        <View key={m.key} style={[s.row, elevation(t), { borderColor: t.hairline, backgroundColor: t.card }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput value={m.name} onChangeText={(v) => onChange(m.key, { name: v })} style={{ flex: 1, color: t.text, fontWeight: "700", fontSize: 15 }} accessibilityLabel="Medicine name" />
            <Pressable onPress={() => onRemove(m.key)} hitSlop={10} accessibilityLabel={`Remove ${m.name}`}>
              <Ionicons name="close-circle" size={22} color={t.muted} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput value={m.dose ?? ""} onChangeText={(v) => onChange(m.key, { dose: v })} placeholder="Dose" placeholderTextColor={t.muted} style={small} />
            <TextInput value={m.frequency ?? ""} onChangeText={(v) => onChange(m.key, { frequency: v })} placeholder="How often (1-0-1, BD)" placeholderTextColor={t.muted} style={small} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => ({ value: m, label: String(m) }));

/** Step 2 after a prescription scan: checks its medicines; result passed up for "refer to doctor". */
export function PrescriptionMedCheck({ medicines, onResult }: { medicines: MedicineEntry[]; onResult: (r: MedCheckResult | null) => void }) {
  const t = useTheme();
  const { user, role, account, careAvailable } = useAuth();
  const isPatient = Boolean(user) && role === "patient" && careAvailable;
  const [month, setMonth] = useState<number | null>(account?.patient?.pregnancy_month ?? null);
  const [state, setState] = useState<{ month: number | null; result: MedCheckResult | null; error: string | null } | null>(null);
  const [added, setAdded] = useState<"idle" | "busy" | "done">("idle");
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (!medicines.length) return;
    let alive = true;
    checkMedicines(medicines, month).then(
      (result) => {
        if (!alive) return;
        setState({ month, result, error: null });
        onResultRef.current(result);
      },
      (e) => {
        if (alive) setState({ month, result: null, error: careErrorMessage(e, "Couldn't check the medicines.") });
      },
    );
    return () => {
      alive = false;
    };
  }, [medicines, month]);

  if (!medicines.length) return null;
  const current = state && state.month === month ? state : null;

  async function addToMine() {
    if (!user) return;
    setAdded("busy");
    try {
      await addMyMedicines(user.id, medicines, "prescription");
      setAdded("done");
    } catch {
      setAdded("idle");
    }
  }

  return (
    <View style={[s.panel, { borderColor: t.info, backgroundColor: t.card }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Ionicons name="medkit" size={22} color={t.info} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.info, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 }}>STEP 2 · MEDICINE SAFETY</Text>
          <Text style={{ color: t.text, fontWeight: "800", fontSize: 16 }}>Are these medicines OK in pregnancy?</Text>
        </View>
      </View>
      <Text style={{ color: t.muted }}>Month of pregnancy</Text>
      <Chips options={MONTHS} selected={month ? [month] : []} onToggle={(m) => setMonth(month === m ? null : m)} />
      {!current ? (
        <ActivityIndicator color={t.info} />
      ) : current.error ? (
        <Text style={{ color: t.danger }}>{current.error}</Text>
      ) : current.result ? (
        <MedCheckView result={current.result} compact />
      ) : null}
      {current?.result ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Pressable
            onPress={() => router.push({ pathname: "/medicines", params: { prefill: JSON.stringify(medicines) } })}
            style={[s.btn, { borderColor: t.border }]}
            accessibilityRole="button"
          >
            <Text style={{ color: t.text, fontWeight: "700" }}>Daily timing plan</Text>
          </Pressable>
          {isPatient ? (
            <Pressable onPress={addToMine} disabled={added !== "idle"} style={[s.btn, { borderColor: t.border, opacity: added === "idle" ? 1 : 0.6 }]} accessibilityRole="button">
              <Text style={{ color: t.text, fontWeight: "700" }}>{added === "done" ? "Added to My medicines ✓" : added === "busy" ? "Adding…" : "Add to My medicines"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  banner: { borderRadius: 20, padding: 14, gap: 4 },
  tri: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 6, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  input: { borderWidth: 1, borderRadius: 14, minHeight: 46, paddingHorizontal: 12, fontSize: 16 },
  suggest: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  suggestRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  row: { borderWidth: 1, borderRadius: 18, padding: 10, gap: 8 },
  small: { flex: 1, borderWidth: 1, borderRadius: 12, minHeight: 38, paddingHorizontal: 10, fontSize: 13 },
  panel: { borderWidth: 1.5, borderRadius: 18, padding: 14, gap: 10 },
  btn: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
});
