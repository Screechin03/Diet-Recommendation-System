import { useState, type ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useTheme } from "./theme";

export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function H1({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.h1, { color: t.text }]}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.h2, { color: t.text }]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const t = useTheme();
  return <Text style={[styles.body, { color: muted ? t.muted : t.text }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const t = useTheme();
  const bg = variant === "primary" ? t.primary : variant === "danger" ? t.dangerSoft : t.primarySoft;
  const fg = variant === "primary" ? t.onPrimary : variant === "danger" ? t.danger : t.primary;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: inactive ? 0.55 : pressed ? 0.85 : 1 }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={[
          styles.input,
          props.multiline && { minHeight: 76, textAlignVertical: "top", paddingTop: 10 },
          { backgroundColor: t.input, borderColor: t.border, color: t.text },
        ]}
      />
      {hint ? <Text style={[styles.hint, { color: t.muted }]}>{hint}</Text> : null}
    </View>
  );
}

/** Password input with an eye button to show or hide what was typed. */
export function PasswordField({ label, hint, ...props }: Omit<TextInputProps, "secureTextEntry"> & { label: string; hint?: string }) {
  const t = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      <View>
        <TextInput
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoCorrect={false}
          {...props}
          secureTextEntry={!visible}
          style={[styles.input, styles.passwordInput, { backgroundColor: t.input, borderColor: t.border, color: t.text }]}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          hitSlop={8}
          style={styles.eye}
        >
          <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={22} color={t.muted} />
        </Pressable>
      </View>
      {hint ? <Text style={[styles.hint, { color: t.muted }]}>{hint}</Text> : null}
    </View>
  );
}

/** Numeric input that keeps a local string while typing, and reports a number. */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  decimal,
}: {
  label: string;
  value: number | undefined;
  onChange: (n: number) => void;
  unit?: string;
  decimal?: boolean;
}) {
  return (
    <Field
      label={unit ? `${label} (${unit})` : label}
      defaultValue={value == null ? "" : String(value)}
      keyboardType={decimal ? "decimal-pad" : "number-pad"}
      onChangeText={(s) => {
        const n = Number(s.replace(",", "."));
        if (s.trim() !== "" && Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

export function Row({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: "row", gap }}>{children}</View>;
}

export function Col({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1 }}>{children}</View>;
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.toggleRow} accessibilityRole="switch">
      <View style={{ flex: 1 }}>
        <Text style={[styles.body, { color: t.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: t.muted }]}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.primary }} />
    </Pressable>
  );
}

export function Chips<T extends string | number>({
  options,
  selected,
  onToggle,
}: {
  options: Array<{ value: T; label: string }>;
  selected: T[];
  onToggle: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onToggle(o.value)}
            accessibilityState={{ selected: on }}
            style={[
              styles.chip,
              { borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : t.card },
            ]}
          >
            <Text style={{ color: on ? t.primary : t.text, fontWeight: on ? "600" : "400" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.sectionLabel, { color: t.muted }]}>{children}</Text>;
}

export function ErrorBox({ message }: { message: string | null }) {
  const t = useTheme();
  if (!message) return null;
  return (
    <View style={[styles.notice, { backgroundColor: t.dangerSoft }]}>
      <Text style={{ color: t.danger }}>{message}</Text>
    </View>
  );
}

export function InfoBox({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: t.primarySoft }]}>
      <Text style={{ color: t.text }}>{children}</Text>
    </View>
  );
}

export function Bullets({ items, color }: { items: string[] | undefined; color?: string }) {
  const t = useTheme();
  if (!items?.length) return null;
  return (
    <View style={{ gap: 6 }}>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 8 }}>
          <Text style={{ color: color ?? t.primary }}>•</Text>
          <Text style={[styles.body, { color: t.text, flex: 1 }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function Disclaimer() {
  return (
    <Body muted style={{ fontSize: 12, textAlign: "center", marginTop: 8 }}>
      This app gives general guidance, not medical advice. Always follow your clinician’s instructions.
    </Body>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 48, gap: 16 },
  h1: { fontSize: 26, fontWeight: "700" },
  h2: { fontSize: 18, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  button: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonText: { fontSize: 16, fontWeight: "600" },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 10, minHeight: 46, paddingHorizontal: 12, fontSize: 16 },
  hint: { fontSize: 12 },
  passwordInput: { paddingRight: 48 },
  eye: { position: "absolute", right: 0, top: 0, bottom: 0, width: 48, alignItems: "center", justifyContent: "center" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  sectionLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  notice: { borderRadius: 12, padding: 12 },
});
