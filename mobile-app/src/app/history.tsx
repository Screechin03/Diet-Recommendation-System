import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Body, EmptyState, ErrorBox, InfoBox, Screen } from "@/components/ui";
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
      {rows && !rows.length ? (
        <EmptyState icon="time-outline" title="Nothing here yet" text="Every set of recipes you get is kept here, newest first." action="Plan meals" onAction={() => router.navigate("/planner")} />
      ) : null}
      {rows?.map((row) => (
        <View key={row.id} style={{ gap: 6 }}>
          <Body muted style={{ fontSize: 12, fontWeight: "600" }}>
            {new Date(row.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </Body>
          <RecipeCard recipe={row.recipe} />
        </View>
      ))}
    </Screen>
  );
}
