import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Body, ErrorBox, InfoBox, Screen } from "@/components/ui";
import { RecipeCard } from "@/components/RecipeCard";
import { useAuth } from "@/lib/auth";
import { getHistory, type RecipeHistoryRow } from "@/lib/userData";

export default function HistoryScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<RecipeHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      getHistory(user.id)
        .then(setRows)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load history"));
    }, [user]),
  );

  if (!user) return <Screen><InfoBox>Log in to see your history.</InfoBox></Screen>;

  return (
    <Screen>
      <ErrorBox message={error} />
      {!rows && !error ? <ActivityIndicator /> : null}
      {rows && !rows.length ? <InfoBox>No history yet. Recommendations you get will show up here.</InfoBox> : null}
      {rows?.map((row) => (
        <View key={row.id} style={{ gap: 6 }}>
          <Body muted style={{ fontSize: 12 }}>
            {new Date(row.created_at).toLocaleString()} · {row.source_page}
          </Body>
          <RecipeCard recipe={row.recipe} />
        </View>
      ))}
    </Screen>
  );
}
