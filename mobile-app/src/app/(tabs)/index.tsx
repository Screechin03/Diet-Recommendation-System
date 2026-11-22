import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Disclaimer, Screen } from "@/components/ui";
import { DoctorWidget, FocusWidget, GreetingHeader, JourneyCard, NewsWidget, QuickActions, SectionTitle, ToolList } from "@/components/Widgets";
import { useAuth } from "@/lib/auth";
import { updatePregnancyMonth } from "@/lib/care";
import { useCareBadge, useCareLinks } from "@/lib/careHooks";
import { getNews, type NewsCard } from "@/lib/insights";
import { loadProfile, saveProfile } from "@/lib/profile";

export default function Home() {
  const { user, account, careAvailable, refreshAccount } = useAuth();
  const { active, loading: careLoading } = useCareLinks();
  const unread = useCareBadge();

  const [month, setMonth] = useState(() => account?.patient?.pregnancy_month ?? loadProfile().pregnancy_month);
  const serverMonth = account?.patient?.pregnancy_month;
  useEffect(() => {
    if (serverMonth) setMonth(serverMonth);
  }, [serverMonth]);

  const [news, setNews] = useState<{ value: NewsCard | null; loading: boolean }>({ value: null, loading: true });
  useEffect(() => {
    let live = true;
    void getNews().then((value) => live && setNews({ value, loading: false }));
    return () => {
      live = false;
    };
  }, []);

  const changeMonth = useCallback(
    (m: number) => {
      setMonth(m);
      saveProfile({ ...loadProfile(), pregnancy_month: m });
      if (user && careAvailable) void updatePregnancyMonth(user.id, m).then(refreshAccount).catch(() => undefined);
    },
    [user, careAvailable, refreshAccount],
  );

  const name = account?.patient?.full_name ?? (user?.user_metadata?.full_name as string | undefined) ?? null;

  return (
    <Screen safeTop>
      <GreetingHeader name={name} onAvatar={() => router.navigate("/account")} />
      <JourneyCard month={month} onChangeMonth={changeMonth} />
      <QuickActions
        items={[
          { icon: "scan-outline", label: "Scan Rx", href: "/report" },
          { icon: "medkit-outline", label: "Medicines", href: "/medicines" },
          { icon: "pulse-outline", label: "Vitals", href: "/vitals" },
          { icon: "restaurant-outline", label: "Meals", href: "/planner" },
        ]}
      />
      <FocusWidget month={month} />
      {careAvailable && user ? <DoctorWidget link={active} loading={careLoading} unread={unread} /> : null}

      <SectionTitle>Today’s read</SectionTitle>
      <NewsWidget news={news.value} loading={news.loading} />

      <SectionTitle>More tools</SectionTitle>
      <ToolList
        items={[
          { icon: "analytics-outline", title: "Health risk check", text: "Your vitals through our risk model", href: "/health" },
          { icon: "heart-outline", title: "Saved recipes", text: "Meals you’ve kept for later", href: "/saved" },
          { icon: "time-outline", title: "Recommendation history", text: "Every plan you’ve generated", href: "/history" },
          { icon: "folder-open-outline", title: "My records", text: "Reports, readings and doctor reviews", href: "/account" },
        ]}
      />
      <View style={{ height: 4 }} />
      <Disclaimer />
    </Screen>
  );
}
