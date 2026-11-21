import { Alert, Platform } from "react-native";

/** Asks before a destructive action. Native dialog on phones; the browser's confirm() on web. */
export function confirmAction(title: string, message: string, confirmText: string): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(Boolean(globalThis.confirm?.(`${title}\n\n${message}`)));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmText, style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}
