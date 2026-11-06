import { useState, type ComponentProps, type ReactNode } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  QUALITY_LABEL,
  humanizeDocType,
  type DietPlan,
  type ExtractedReport,
  type LabTest,
  type OcrResult,
} from "@/lib/report";
import { useTheme, type Theme } from "./theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

function SectionCard({ icon, title, count, children }: { icon: IconName; title: string; count?: number; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[s.card, { backgroundColor: t.card, borderColor: t.border }]}>
      <View style={s.sectionHead}>
        <Ionicons name={icon} size={17} color={t.muted} />
        <Text style={[s.sectionTitle, { color: t.text }]}>{title}</Text>
        {count != null ? (
          <View style={[s.count, { backgroundColor: t.muted2 }]}>
            <Text style={{ color: t.muted, fontSize: 11, fontWeight: "700" }}>{count}</Text>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Dots({ items, t }: { items: string[]; t: Theme }) {
  return (
    <View style={{ gap: 8 }}>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 10 }}>
          <View style={[s.dot, { backgroundColor: t.border }]} />
          <Text style={[s.body, { color: t.text, flex: 1 }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function Chip({ label, bg, fg, strong }: { label: string; bg: string; fg: string; strong?: boolean }) {
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: strong ? "700" : "500" }}>{label}</Text>
    </View>
  );
}

function flagTone(flag: LabTest["flag"], t: Theme) {
  const f = (flag ?? "").toLowerCase();
  if (!f) return null;
  if (f.startsWith("h") || f.includes("abnormal") || f.includes("critical")) return { bg: t.dangerSoft, fg: t.danger };
  if (f.startsWith("l")) return { bg: t.infoSoft, fg: t.info };
  return { bg: t.successSoft, fg: t.success };
}

export function ReportCard({ report }: { report: ExtractedReport }) {
  const t = useTheme();
  const { patient, document: doc } = report;
  const meta: Array<[IconName, string, string | undefined]> = [
    ["person-outline", "Patient", [patient.name, patient.age, patient.sex].filter(Boolean).join(" · ") || undefined],
    ["calendar-outline", "Date", doc.date],
    ["medkit-outline", "Provider", doc.provider],
  ];

  return (
    <View style={{ gap: 14 }}>
      <View style={[s.card, { backgroundColor: t.primarySoft, borderColor: t.primarySoft }]}>
        <Text style={[s.eyebrow, { color: t.primary }]}>{humanizeDocType(doc.type).toUpperCase()}</Text>
        {meta.filter(([, , v]) => v).map(([icon, label, value]) => (
          <View key={label} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <View style={[s.metaIcon, { backgroundColor: t.card }]}>
              <Ionicons name={icon} size={16} color={t.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.muted, fontSize: 11, letterSpacing: 0.6 }}>{label.toUpperCase()}</Text>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }}>{value}</Text>
            </View>
          </View>
        ))}
        {report.allergies.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <Ionicons name="warning-outline" size={15} color={t.danger} />
            <Text style={{ color: t.danger, fontWeight: "700", fontSize: 13 }}>Allergies</Text>
            {report.allergies.map((a) => (
              <Chip key={a} label={a} bg={t.dangerSoft} fg={t.danger} />
            ))}
          </View>
        ) : null}
      </View>

      {report.uncertainties.length ? (
        <View style={[s.callout, { backgroundColor: t.warnSoft }]}>
          <Ionicons name="alert-circle-outline" size={20} color={t.warn} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: t.text, fontWeight: "700" }}>Couldn’t read with certainty</Text>
            {report.uncertainties.map((u, i) => (
              <Text key={i} style={[s.body, { color: t.text }]}>• {u}</Text>
            ))}
            <Text style={{ color: t.muted, fontSize: 12 }}>Check these against the original or ask your clinician.</Text>
          </View>
        </View>
      ) : null}

      {report.medications.length ? (
        <SectionCard icon="medical-outline" title="Medicines" count={report.medications.length}>
          {report.medications.map((m, i) => (
            <View key={i} style={[s.inner, { borderColor: t.border }]}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>{m.name}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {m.dose ? <Chip label={m.dose} bg={t.text} fg={t.card} strong /> : null}
                {m.frequency ? <Chip label={m.frequency} bg={t.muted2} fg={t.text} /> : null}
                {m.duration ? <Chip label={m.duration} bg={t.muted2} fg={t.text} /> : null}
              </View>
              {m.notes ? <Text style={{ color: t.muted, fontSize: 13, lineHeight: 19 }}>{m.notes}</Text> : null}
            </View>
          ))}
        </SectionCard>
      ) : null}

      {report.tests.length ? (
        <SectionCard icon="flask-outline" title="Test results" count={report.tests.length}>
          {report.tests.map((tst, i) => {
            const tone = flagTone(tst.flag, t);
            return (
              <View key={i} style={[s.testRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "600" }}>{tst.name}</Text>
                  {tst.reference_range ? <Text style={{ color: t.muted, fontSize: 12 }}>Ref {tst.reference_range}</Text> : null}
                </View>
                <Text style={{ color: t.text, fontVariant: ["tabular-nums"], fontWeight: "600" }}>
                  {tst.value ?? "—"} <Text style={{ color: t.muted, fontWeight: "400" }}>{tst.unit ?? ""}</Text>
                </Text>
                {tone ? <Chip label={(tst.flag ?? "").toUpperCase()} bg={tone.bg} fg={tone.fg} strong /> : null}
              </View>
            );
          })}
        </SectionCard>
      ) : null}

      {report.diagnoses.length ? (
        <SectionCard icon="pulse-outline" title="Diagnoses">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {report.diagnoses.map((d) => (
              <Chip key={d} label={d} bg={t.muted2} fg={t.text} />
            ))}
          </View>
        </SectionCard>
      ) : null}
      {report.instructions.length ? (
        <SectionCard icon="information-circle-outline" title="Instructions"><Dots items={report.instructions} t={t} /></SectionCard>
      ) : null}
      {report.dietary_notes.length ? (
        <SectionCard icon="restaurant-outline" title="Dietary notes on the document"><Dots items={report.dietary_notes} t={t} /></SectionCard>
      ) : null}
      {report.follow_up.length ? (
        <SectionCard icon="calendar-outline" title="Follow-up"><Dots items={report.follow_up} t={t} /></SectionCard>
      ) : null}
    </View>
  );
}

export function DietPlanCard({ plan }: { plan: DietPlan }) {
  const t = useTheme();
  const Row = ({ ok, text }: { ok: boolean; text: string }) => (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <View style={[s.mark, { backgroundColor: ok ? t.successSoft : t.dangerSoft }]}>
        <Ionicons name={ok ? "checkmark" : "close"} size={13} color={ok ? t.success : t.danger} />
      </View>
      <Text style={[s.body, { color: t.text, flex: 1 }]}>{text}</Text>
    </View>
  );
  return (
    <View style={[s.card, { backgroundColor: t.card, borderColor: t.border, padding: 0, overflow: "hidden" }]}>
      <View style={{ padding: 16, gap: 6, backgroundColor: t.muted2 }}>
        <Text style={[s.eyebrow, { color: t.primary }]}>YOUR DIET PLAN</Text>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{plan.title}</Text>
        {plan.summary ? <Text style={[s.body, { color: t.muted }]}>{plan.summary}</Text> : null}
      </View>
      <View style={{ padding: 16, gap: 18 }}>
        {plan.do.length ? (
          <View style={{ gap: 10 }}>
            <Text style={[s.label, { color: t.success }]}>EAT MORE OF</Text>
            {plan.do.map((d, i) => <Row key={i} ok text={d} />)}
          </View>
        ) : null}
        {plan.avoid.length ? (
          <View style={{ gap: 10 }}>
            <Text style={[s.label, { color: t.danger }]}>LIMIT OR AVOID</Text>
            {plan.avoid.map((d, i) => <Row key={i} ok={false} text={d} />)}
          </View>
        ) : null}
        {plan.meal_ideas.length ? (
          <View style={{ gap: 8 }}>
            <Text style={[s.label, { color: t.muted }]}>MEAL IDEAS</Text>
            {plan.meal_ideas.map((m, i) => (
              <View key={i} style={[s.meal, { backgroundColor: t.muted2 }]}>
                <Ionicons name="restaurant-outline" size={15} color={t.primary} />
                <Text style={[s.body, { color: t.text, flex: 1 }]}>{m}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {plan.questions_for_doctor.length ? (
          <View style={{ gap: 8 }}>
            <Text style={[s.label, { color: t.muted }]}>ASK YOUR DOCTOR</Text>
            {plan.questions_for_doctor.map((q, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                <View style={[s.num, { backgroundColor: t.muted2 }]}>
                  <Text style={{ color: t.muted, fontSize: 11, fontWeight: "700" }}>{i + 1}</Text>
                </View>
                <Text style={[s.body, { color: t.text, flex: 1 }]}>{q}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {plan.safety_notes.length ? <Text style={{ color: t.muted, fontSize: 12, lineHeight: 18 }}>{plan.safety_notes.join(" ")}</Text> : null}
      </View>
    </View>
  );
}

export function ScanCard({ ocr }: { ocr: OcrResult }) {
  const t = useTheme();
  const [zoom, setZoom] = useState(false);
  const pct = Math.round(ocr.avg_confidence * 100);
  const readable = ocr.quality === "clear" || ocr.quality === "partial";
  const tone =
    ocr.quality === "clear"
      ? { bg: t.successSoft, fg: t.success, icon: "checkmark-circle" as IconName }
      : ocr.quality === "partial"
        ? { bg: t.warnSoft, fg: t.warn, icon: "alert-circle" as IconName }
        : { bg: t.muted2, fg: t.muted, icon: "information-circle" as IconName };
  const barColor = ocr.avg_confidence >= 0.85 ? t.success : ocr.avg_confidence >= 0.6 ? t.warn : t.danger;
  const [w, h] = ocr.image_size;

  return (
    <View style={[s.card, { backgroundColor: t.card, borderColor: t.border, padding: 0, overflow: "hidden" }]}>
      <View style={[s.scanHead, { borderColor: t.border }]}>
        <View style={[s.metaIcon, { backgroundColor: t.text }]}>
          <Ionicons name="scan-outline" size={16} color={t.card} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "700" }}>Handwriting scan</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>Block capitals & digits</Text>
        </View>
        <View style={[s.chip, { backgroundColor: tone.bg, flexDirection: "row", gap: 4, alignItems: "center" }]}>
          <Ionicons name={tone.icon} size={13} color={tone.fg} />
          <Text style={{ color: tone.fg, fontSize: 12, fontWeight: "600" }}>{QUALITY_LABEL[ocr.quality]}</Text>
        </View>
      </View>

      {ocr.annotated_image ? (
        <Pressable onPress={() => setZoom(true)} accessibilityRole="imagebutton" accessibilityLabel="Enlarge scanned image">
          <Image
            source={{ uri: ocr.annotated_image }}
            style={{ width: "100%", height: 280, backgroundColor: t.muted2 }}
            resizeMode="contain"
          />
          <View style={s.zoomHint}>
            <Ionicons name="expand-outline" size={14} color="#fff" />
          </View>
        </Pressable>
      ) : null}

      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: t.muted, fontSize: 12 }}>Average confidence · {ocr.character_count} characters</Text>
            <Text style={{ color: t.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{pct}%</Text>
          </View>
          <View style={[s.bar, { backgroundColor: t.muted2 }]}>
            <View style={[s.barFill, { width: `${pct}%`, backgroundColor: barColor }]} />
          </View>
        </View>

        {readable ? (
          <View style={[s.textBox, { backgroundColor: t.muted2 }]}>
            {ocr.lines.map((line, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text selectable style={{ color: t.text, fontFamily: "monospace", fontSize: 15, flex: 1 }}>{line.text}</Text>
                <Text style={{ color: t.muted, fontSize: 11 }}>{Math.round(line.confidence * 100)}%</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={[s.body, { color: t.muted }]}>{ocr.message}</Text>

        <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
          {[
            [t.success, "Confident"],
            [t.warn, "Unsure"],
            [t.danger, "Likely wrong"],
          ].map(([c, l]) => (
            <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c }} />
              <Text style={{ color: t.muted, fontSize: 11 }}>{l}</Text>
            </View>
          ))}
        </View>
      </View>

      <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)}>
        <View style={s.modal}>
          <ScrollView
            maximumZoomScale={4}
            minimumZoomScale={1}
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            centerContent
          >
            {ocr.annotated_image ? (
              <Image source={{ uri: ocr.annotated_image }} style={{ width: "100%", aspectRatio: w && h ? w / h : 1 }} resizeMode="contain" />
            ) : null}
          </ScrollView>
          <Pressable onPress={() => setZoom(false)} style={s.close} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  inner: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  count: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.6 },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  body: { fontSize: 14.5, lineHeight: 21 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  metaIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  callout: { flexDirection: "row", gap: 10, borderRadius: 16, padding: 14 },
  testRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  mark: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 1 },
  meal: { flexDirection: "row", gap: 10, borderRadius: 12, padding: 12, alignItems: "flex-start" },
  num: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  scanHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  zoomHint: { position: "absolute", right: 10, top: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 999, padding: 6 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  textBox: { borderRadius: 12, padding: 12, gap: 6 },
  modal: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)" },
  close: { position: "absolute", top: 54, right: 18, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 999, padding: 8 },
});
