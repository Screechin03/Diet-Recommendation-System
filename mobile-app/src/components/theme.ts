import { useColorScheme } from "react-native";

const light = {
  bg: "#FFF7F9",
  card: "#FFFFFF",
  text: "#2A1E24",
  muted: "#6E5E66",
  border: "#F0DDE4",
  primary: "#D6336C",
  primarySoft: "#FFE4EC",
  onPrimary: "#FFFFFF",
  success: "#2F9E44",
  successSoft: "#E6F6EA",
  danger: "#C92A2A",
  dangerSoft: "#FFECEC",
  warn: "#E67700",
  warnSoft: "#FFF4E0",
  info: "#1971C2",
  infoSoft: "#E7F1FB",
  input: "#FFFFFF",
  muted2: "#F6EEF1",
};

const dark: typeof light = {
  bg: "#171114",
  card: "#221A1E",
  text: "#F6ECF0",
  muted: "#B7A6AE",
  border: "#3A2D33",
  primary: "#F06595",
  primarySoft: "#3D1F2A",
  onPrimary: "#1A0F14",
  success: "#69DB7C",
  successSoft: "#1C2E21",
  danger: "#FF8787",
  dangerSoft: "#3A1C1C",
  warn: "#FFA94D",
  warnSoft: "#3A2A14",
  info: "#74C0FC",
  infoSoft: "#14273A",
  input: "#1B1418",
  muted2: "#2B2126",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
