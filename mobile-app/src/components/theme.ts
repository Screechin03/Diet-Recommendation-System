import { Platform, useColorScheme, type ViewStyle } from "react-native";

// MamaCare palette: rose on warm white. Every screen reads colours from here.
const light = {
  bg: "#FFF8FA",
  card: "#FFFFFF",
  text: "#24171D",
  muted: "#75636C",
  subtle: "#A8949D",
  border: "#F3E2E8",
  hairline: "#F7ECF0",
  primary: "#D6336C",
  primaryDeep: "#A61E4D",
  primarySoft: "#FFE4EC",
  primaryTint: "#FFF1F5",
  onPrimary: "#FFFFFF",
  success: "#2F9E44",
  successSoft: "#E6F6EA",
  danger: "#C92A2A",
  dangerSoft: "#FFECEC",
  warn: "#D9480F",
  warnSoft: "#FFF1E6",
  info: "#1C7ED6",
  infoSoft: "#E7F1FB",
  input: "#FBF3F6",
  muted2: "#F8EEF2",
  shadow: "#A61E4D",
};

const dark: typeof light = {
  bg: "#140E11",
  card: "#1F171B",
  text: "#F7EDF1",
  muted: "#B9A7AF",
  subtle: "#8C7880",
  border: "#33262C",
  hairline: "#2A1F24",
  primary: "#F06595",
  primaryDeep: "#FF8FB3",
  primarySoft: "#3D1F2A",
  primaryTint: "#2A161E",
  onPrimary: "#1A0F14",
  success: "#69DB7C",
  successSoft: "#1C2E21",
  danger: "#FF8787",
  dangerSoft: "#3A1C1C",
  warn: "#FFA94D",
  warnSoft: "#3A2A14",
  info: "#74C0FC",
  infoSoft: "#14273A",
  input: "#1A1317",
  muted2: "#2B2126",
  shadow: "#000000",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

/** Soft, rose-tinted elevation for cards (iOS shadow / Android elevation / web box-shadow). */
export function elevation(t: Theme, level: 1 | 2 = 1): ViewStyle {
  if (Platform.OS === "android") return { elevation: level === 1 ? 1 : 4 };
  return {
    shadowColor: t.shadow,
    shadowOpacity: level === 1 ? 0.06 : 0.12,
    shadowRadius: level === 1 ? 14 : 24,
    shadowOffset: { width: 0, height: level === 1 ? 4 : 10 },
  };
}

/** Type scale (system fonts: SF Pro on iOS, Roboto on Android). */
export const type = {
  display: { fontSize: 30, fontWeight: "800" as const, letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: "800" as const, letterSpacing: -0.3 },
  headline: { fontSize: 17, fontWeight: "700" as const, letterSpacing: -0.1 },
  body: { fontSize: 15, lineHeight: 22 },
  caption: { fontSize: 12.5, lineHeight: 17 },
  eyebrow: { fontSize: 11, fontWeight: "800" as const, letterSpacing: 1.4, textTransform: "uppercase" as const },
};
