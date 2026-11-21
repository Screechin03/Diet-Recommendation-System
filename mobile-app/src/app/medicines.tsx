import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Body, Button, Card, Chips, ErrorBox, Screen, SectionLabel } from "@/components/ui";
import { ShareWithDoctor } from "@/components/Care";
import { MedCheckView, MedicineRows, MedicineSearch, type EditableMedicine } from "@/components/Meds";
import { useTheme } from "@/components/theme";
import { useAuth } from "@/lib/auth";
import { careErrorMessage, updatePregnancyMonth } from "@/lib/care";
import { useLiveData } from "@/lib/careHooks";
import { addMyMedicines, checkMedicines, deleteMyMedicine, listMyMedicines, medCheckRecord, updateMyMedicine, type MedCheckResult, type MedicineEntry } from "@/lib/meds";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => ({ value: m, label: String(m) }));
let counter = 0;
const newKey = () => `m${Date.now().toString(36)}${counter++}`;

export default function MedicinesScreen() {
  const t = useTheme();
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();
  const { user, role, account, careAvailable } = useAuth();
  const isPatient = Boolean(user) && role === "patient" && careAvailable;
  const [month, setMonth] = useState<number | null>(account?.patient?.pregnancy_month ?? null);
  const [items, setItems] = useState<EditableMedicine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MedCheckResult | null>(null);
  const [runId, setRunId] = useState(0);
  const used = useRef(false);

  const load = useCallback(async () => {
    if (loaded) return;
    let start: EditableMedicine[] = [];
    if (prefill && !used.current) {
      used.current = true;
      try {
        start = (JSON.parse(prefill) as MedicineEntry[]).map((m) => ({ ...m, key: newKey() }));
      } catch {
        // ignore a broken hand-over
      }
    }
    if (isPatient && user) {
      try {
        const mine = (await listMyMedicines(user.id)).map((m) => ({ ...m, key: m.id }));
        const known = new Set(mine.map((m) => m.name.toLowerCase()));
        start = [...mine, ...start.filter((m) => !known.has(m.name.toLowerCase()))];
      } catch (e) {
        setError(careErrorMessage(e, "Couldn't load your medicines."));
      }
    }
    setItems(start);
    setLoaded(true);
  }, [isPatient, user, loaded, prefill]);
  useLiveData(load, 600_000);

  async function add(name: string) {
    setError(null);
    if (items.some((m) => m.name.toLowerCase() === name.toLowerCase())) return;
    if (isPatient && user) {
      try {
        const [row] = await addMyMedicines(user.id, [{ name }], "manual");
        setItems((xs) => [...xs, { ...row, key: row.id }]);
        return;
      } catch (e) {
        setError(careErrorMessage(e, "Couldn't save that medicine."));
      }
    }
    setItems((xs) => [...xs, { name, key: newKey() }]);
  }

  async function remove(key: string) {
    const item = items.find((m) => m.key === key);
    setItems((xs) => xs.filter((m) => m.key !== key));
    if (item?.id) await deleteMyMedicine(item.id).catch((e) => setError(careErrorMessage(e)));
  }

  async function run() {
    const meds = items.filter((m) => m.name.trim());
    if (!meds.length) return;
    setBusy(true);
    setError(null);
    try {
      if (isPatient && user) {
        await Promise.all(meds.filter((m) => m.id && m.dirty).map((m) => updateMyMedicine(m.id!, { name: m.name.trim(), dose: m.dose || null, frequency: m.frequency || null })));
        const unsaved = meds.filter((m) => !m.id);
        if (unsaved.length) {
          const rows = await addMyMedicines(user.id, unsaved, "prescription");
          setItems((xs) => xs.map((m) => {
            const row = !m.id ? rows.find((r) => r.name === m.name.trim()) : undefined;
            return row ? { ...row, key: m.key } : { ...m, dirty: false };
          }));
        }
        if (month && month !== account?.patient?.pregnancy_month) void updatePregnancyMonth(user.id, month).catch(() => undefined);
      }
      setResult(await checkMedicines(meds, month));
      setRunId((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Screen key={`result-${runId}`}>
        <MedCheckView result={result} />
        <ShareWithDoctor key={runId} build={() => medCheckRecord(result)} what="this medicine check" />
        <Button title="Edit medicines" variant="secondary" onPress={() => setResult(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ color: t.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.6 }}>MEDICINE SAFETY</Text>
        <Text style={{ color: t.text, fontSize: 25, fontWeight: "800" }}>Is this medicine OK in pregnancy?</Text>
        <Body muted>We check each medicine for your month of pregnancy, look for clashes, and suggest when to take them.</Body>
      </View>
      <Card>
        <SectionLabel>Month of pregnancy</SectionLabel>
        <Chips options={MONTHS} selected={month ? [month] : []} onToggle={(m) => setMonth(month === m ? null : m)} />
        {!month ? <Body muted>Not set: we’ll show all three trimesters.</Body> : null}
      </Card>
      <Card>
        <SectionLabel>Your medicines</SectionLabel>
        {isPatient ? <Body muted>Saved to My medicines. Your doctor can see them.</Body> : null}
        <MedicineSearch onAdd={(n) => void add(n)} />
        <MedicineRows
          items={items}
          onChange={(key, patch) => setItems((xs) => xs.map((m) => (m.key === key ? { ...m, ...patch, dirty: true } : m)))}
          onRemove={(key) => void remove(key)}
        />
      </Card>
      <ErrorBox message={error} />
      <Button title={`Check ${items.length || ""} medicine${items.length === 1 ? "" : "s"}`.replace("  ", " ")} onPress={run} loading={busy} disabled={!items.some((m) => m.name.trim())} />
    </Screen>
  );
}
