// MamaCare design system: the building blocks every screen uses. Rose on warm white, soft depth, generous
// spacing, one clear primary action per card. Change the look here, not in the screens.
import { useState, type ComponentProps, type ReactNode } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { elevation, type, useTheme } from "./theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

/** Scrolling page. `safeTop` adds the status-bar inset for screens without a navigation header. */
export function Screen({ children, safeTop }: { children: ReactNode; safeTop?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={[styles.screen, safeTop ? { paddingTop: insets.top + 12 } : null]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

/** Large page title with an optional eyebrow, subtitle and a control on the right. */
export function PageHeader({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.pageHeader}>
      <View style={{ flex: 1, gap: 4 }}>
        {eyebrow ? <Text style={[type.eyebrow, { color: t.primary }]}>{eyebrow}</Text> : null}
        <Text style={[type.display, { color: t.text }]}>{title}</Text>
        {subtitle ? <Text style={[type.body, { color: t.muted, marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function H1({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[type.display, { color: t.text }]}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[type.title, { color: t.text, fontSize: 19 }]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const t = useTheme();
  return <Text style={[type.body, { color: muted ? t.muted : t.text }, style]}>{children}</Text>;
}

export function Card({ children, style, tone = "plain" }: { children: ReactNode; style?: ViewStyle; tone?: "plain" | "tinted" }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.card,
        tone === "tinted" ? { backgroundColor: t.primaryTint, borderColor: t.primarySoft } : { backgroundColor: t.card, borderColor: t.hairline },
        tone === "plain" ? elevation(t) : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A card with a small icon, a title and an optional action link in its header. */
export function Widget({
  icon,
  title,
  action,
  onAction,
  children,
  style,
}: {
  icon?: IconName;
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const t = useTheme();
  return (
    <Card style={{ gap: 12, ...style }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {icon ? <Ionicons name={icon} size={16} color={t.primary} /> : null}
        <Text style={[type.eyebrow, { color: t.muted, flex: 1 }]}>{title}</Text>
        {action && onAction ? (
          <Pressable onPress={onAction} hitSlop={10} accessibilityRole="link">
            <Text style={{ color: t.primary, fontWeight: "700", fontSize: 13 }}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

export function IconCircle({ name, size = 44, tone = "rose" }: { name: IconName; size?: number; tone?: "rose" | "solid" | "white" }) {
  const t = useTheme();
  const bg = tone === "solid" ? t.primary : tone === "white" ? "rgba(255,255,255,0.18)" : t.primarySoft;
  const fg = tone === "solid" || tone === "white" ? "#FFFFFF" : t.primary;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.36, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={name} size={size * 0.48} color={fg} />
    </View>
  );
}

/** The MamaCare mark: a heart on a rose gradient tile. */
export function BrandMark({ size = 64 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={[{ width: size, height: size, borderRadius: size * 0.3, overflow: "hidden", alignItems: "center", justifyContent: "center" }, elevation(t, 2)]}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 10 10" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#B8255A" />
            <Stop offset="1" stopColor="#F06595" />
          </LinearGradient>
        </Defs>
        <Rect width="10" height="10" fill="url(#brand)" />
      </Svg>
      <Ionicons name="heart" size={size * 0.46} color="#FFFFFF" />
    </View>
  );
}

/** Centered brand block at the top of the sign-in screens. */
export function AuthHeader({ title, subtitle, doctor }: { title: string; subtitle: string; doctor?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 10, paddingTop: 20, paddingBottom: 6 }}>
      <BrandMark size={68} />
      <Text style={[type.eyebrow, { color: doctor ? t.info : t.primary, marginTop: 8 }]}>{doctor ? "MamaCare for doctors" : "MamaCare"}</Text>
      <Text style={[type.display, { color: t.text, textAlign: "center" }]}>{title}</Text>
      <Text style={[type.body, { color: t.muted, textAlign: "center", maxWidth: 320 }]}>{subtitle}</Text>
    </View>
  );
}

/** Circular progress (0..1) with content in the middle. */
export function ProgressRing({ value, size = 96, stroke = 9, color, track, children }: { value: number; size?: number; stroke?: number; color: string; track: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
  icon,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: IconName;
}) {
  const t = useTheme();
  const bg = variant === "primary" ? t.primary : variant === "danger" ? t.dangerSoft : variant === "ghost" ? "transparent" : t.primarySoft;
  const fg = variant === "primary" ? t.onPrimary : variant === "danger" ? t.danger : t.primary;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: inactive ? 0.5 : 1, transform: [{ scale: pressed && !inactive ? 0.98 : 1 }] },
        variant === "primary" && !inactive ? elevation(t, 1) : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Filled input that outlines in rose while focused. */
function useFocusStyle() {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return {
    focusProps: { onFocus: () => setFocused(true), onBlur: () => setFocused(false) },
    style: { backgroundColor: focused ? t.card : t.input, borderColor: focused ? t.primary : "transparent", color: t.text },
  };
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const t = useTheme();
  const f = useFocusStyle();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.subtle}
        {...props}
        onFocus={(e) => {
          f.focusProps.onFocus();
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          f.focusProps.onBlur();
          props.onBlur?.(e);
        }}
        style={[styles.input, props.multiline && { minHeight: 84, textAlignVertical: "top", paddingTop: 12 }, f.style]}
      />
      {hint ? <Text style={[styles.hint, { color: t.subtle }]}>{hint}</Text> : null}
    </View>
  );
}

export function PasswordField({ label, hint, ...props }: Omit<TextInputProps, "secureTextEntry"> & { label: string; hint?: string }) {
  const t = useTheme();
  const f = useFocusStyle();
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <View>
        <TextInput
          placeholderTextColor={t.subtle}
          autoCapitalize="none"
          autoCorrect={false}
          {...props}
          {...f.focusProps}
          secureTextEntry={!visible}
          style={[styles.input, styles.passwordInput, f.style]}
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
      {hint ? <Text style={[styles.hint, { color: t.subtle }]}>{hint}</Text> : null}
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
    <Pressable onPress={() => onChange(!value)} style={styles.toggleRow} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: t.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: t.muted }]}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.primary, false: t.border }} thumbColor="#FFFFFF" ios_backgroundColor={t.border} />
    </Pressable>
  );
}

/** Pill choices; the selected ones are filled rose. */
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
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primary : t.card, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={{ color: on ? t.onPrimary : t.text, fontWeight: on ? "700" : "500", fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[type.eyebrow, { color: t.muted }]}>{children}</Text>;
}

function Notice({ icon, bg, fg, children }: { icon: IconName; bg: string; fg: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={18} color={fg} style={{ marginTop: 1 }} />
      <Text style={[type.body, { color: t.text, flex: 1, fontSize: 14 }]}>{children}</Text>
    </View>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  const t = useTheme();
  if (!message) return null;
  return (
    <Notice icon="alert-circle" bg={t.dangerSoft} fg={t.danger}>
      {message}
    </Notice>
  );
}

export function InfoBox({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Notice icon="information-circle" bg={t.primaryTint} fg={t.primary}>
      {children}
    </Notice>
  );
}

export function Bullets({ items, color }: { items: string[] | undefined; color?: string }) {
  const t = useTheme();
  if (!items?.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color ?? t.primary, marginTop: 8 }} />
          <Text style={[type.body, { color: t.text, flex: 1 }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function Disclaimer() {
  const t = useTheme();
  return (
    <Text style={[type.caption, { color: t.subtle, textAlign: "center", marginTop: 4, paddingHorizontal: 12 }]}>
      MamaCare gives general guidance, not medical advice. Always follow your clinician’s instructions.
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, paddingBottom: 56, gap: 18 },
  pageHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 2 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 14 },
  button: { minHeight: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  buttonText: { fontSize: 16, fontWeight: "700", letterSpacing: 0.1 },
  field: { gap: 7 },
  label: { fontSize: 13, fontWeight: "600" },
  input: { borderWidth: 1.5, borderRadius: 14, minHeight: 52, paddingHorizontal: 14, fontSize: 16 },
  passwordInput: { paddingRight: 48 },
  eye: { position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" },
  hint: { fontSize: 12, lineHeight: 16 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  notice: { flexDirection: "row", gap: 10, borderRadius: 16, padding: 14 },
});
