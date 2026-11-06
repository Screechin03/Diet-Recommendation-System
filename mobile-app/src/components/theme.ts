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
  input: "#FFFFFF",
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
  input: "#1B1418",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
