// Home-screen widgets: greeting, pregnancy journey, quick actions, care team, research news, tools.
import { useState, type ReactNode } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { elevation, type, useTheme } from "./theme";
import { Card, IconCircle, ProgressRing, type IconName } from "./ui";
import { doctorName, initials, timeAgo, type CareLink } from "@/lib/care";
import { MONTHS, trimesterOf, type NewsCard } from "@/lib/insights";

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function GreetingHeader({ name, onAvatar }: { name: string | null; onAvatar: () => void }) {
  const t = useTheme();
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const first = name?.trim().split(/\s+/)[0] ?? null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[type.eyebrow, { color: t.subtle }]}>{today}</Text>
        <Text style={[type.display, { color: t.text, fontSize: 28 }]} numberOfLines={1}>
          {greeting()}
          {first ? <Text style={{ color: t.primary }}>{`, ${first}`}</Text> : null}
        </Text>
      </View>
      <Pressable
        onPress={onAvatar}
        accessibilityRole="button"
        accessibilityLabel="My care"
        style={({ pressed }) => [styles.avatar, { backgroundColor: t.card, borderColor: t.primarySoft, opacity: pressed ? 0.8 : 1 }, elevation(t)]}
      >
        {first ? (
          <Text style={{ color: t.primary, fontWeight: "800", fontSize: 16 }}>{initials(name)}</Text>
        ) : (
          <Ionicons name="person" size={20} color={t.primary} />
        )}
      </Pressable>
    </View>
  );
}

/** The rose hero card: month, weeks, baby size, progress through the 9 months. */
export function JourneyCard({ month, onChangeMonth }: { month: number; onChangeMonth: (m: number) => void }) {
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const info = MONTHS[month] ?? MONTHS[4];
  const tri = trimesterOf(month);
  return (
    <View style={[styles.hero, elevation(t, 2)]}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="rose" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#B8255A" />
            <Stop offset="1" stopColor="#E64980" />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="100" fill="url(#rose)" />
      </Svg>
      {/* Quiet decorative rings, top right */}
      <Svg style={styles.rings} width={220} height={220} viewBox="0 0 220 220">
        <Circle cx="170" cy="50" r="90" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" fill="none" />
        <Circle cx="170" cy="50" r="60" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" fill="none" />
      </Svg>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[type.eyebrow, { color: "rgba(255,255,255,0.78)" }]}>{`Trimester ${tri} · Month ${month}`}</Text>
          <Text style={[type.display, { color: "#FFFFFF", fontSize: 32 }]}>{info.weeks}</Text>
          <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 15, lineHeight: 21 }}>
            Your baby is about the size of <Text style={{ fontWeight: "700", color: "#FFFFFF" }}>{info.size}</Text>
          </Text>
        </View>
        <ProgressRing value={month / 9} size={92} stroke={8} color="#FFFFFF" track="rgba(255,255,255,0.22)">
          <Text style={{ color: "#FFFFFF", fontSize: 26, fontWeight: "800", letterSpacing: -0.5 }}>{month}</Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "700", marginTop: -2 }}>OF 9</Text>
        </ProgressRing>
      </View>

      {/* Nine months, grouped by trimester */}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {[0, 1, 2].map((g) => (
            <View key={g} style={{ flex: 1, flexDirection: "row", gap: 4 }}>
              {[1, 2, 3].map((i) => {
                const m = g * 3 + i;
                return <View key={m} style={[styles.seg, { backgroundColor: m <= month ? "#FFFFFF" : "rgba(255,255,255,0.25)" }]} />;
              })}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "600" }}>
            {month >= 9 ? "Final month: nearly there" : `${9 - month} month${9 - month === 1 ? "" : "s"} to go`}
          </Text>
          <Pressable onPress={() => setEditing((e) => !e)} hitSlop={10} accessibilityRole="button" style={styles.heroPill}>
            <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>{editing ? "Done" : "Change month"}</Text>
          </Pressable>
        </View>
      </View>

      {editing ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {Array.from({ length: 9 }, (_, i) => i + 1).map((m) => {
            const on = m === month;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  onChangeMonth(m);
                  setEditing(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Month ${m}`}
                style={[styles.monthDot, { backgroundColor: on ? "#FFFFFF" : "rgba(255,255,255,0.14)" }]}
              >
                <Text style={{ color: on ? t.primaryDeep : "#FFFFFF", fontWeight: "800", fontSize: 13 }}>{m}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function QuickActions({ items }: { items: Array<{ icon: IconName; label: string; href: Href }> }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {items.map((a) => (
        <Pressable
          key={a.label}
          onPress={() => router.navigate(a.href)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.quick,
            { backgroundColor: t.card, borderColor: t.hairline, transform: [{ scale: pressed ? 0.97 : 1 }] },
            elevation(t),
          ]}
        >
          <IconCircle name={a.icon} size={42} />
          <Text style={{ color: t.text, fontSize: 12.5, fontWeight: "700" }} numberOfLines={1}>
            {a.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** "This month" nutrients, with a jump into the meal planner. */
export function FocusWidget({ month }: { month: number }) {
  const t = useTheme();
  const info = MONTHS[month] ?? MONTHS[4];
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={[type.eyebrow, { color: t.muted, flex: 1 }]}>Focus this month</Text>
        <Pressable onPress={() => router.navigate("/planner")} hitSlop={10} accessibilityRole="link">
          <Text style={{ color: t.primary, fontWeight: "700", fontSize: 13 }}>Plan meals</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {info.focus.map((f, i) => (
          <View key={f} style={[styles.focus, { backgroundColor: i === 0 ? t.primarySoft : t.muted2 }]}>
            <Text style={{ color: i === 0 ? t.primaryDeep : t.text, fontWeight: "700", fontSize: 13 }} numberOfLines={1}>
              {f}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function DoctorWidget({ link, loading, unread }: { link: CareLink | null; loading: boolean; unread: number }) {
  const t = useTheme();
  const d = link?.doctor;
  if (loading) {
    return (
      <Card>
        <Skeleton lines={2} />
      </Card>
    );
  }
  if (!link) {
    return (
      <Card tone="tinted" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <IconCircle name="medkit-outline" tone="solid" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.headline, { color: t.text }]}>Add your doctor</Text>
          <Text style={{ color: t.muted, fontSize: 13.5, lineHeight: 19 }}>Share reports and readings, and get their reviews here.</Text>
        </View>
        <Pressable onPress={() => router.navigate("/care/doctors")} style={[styles.smallBtn, { backgroundColor: t.primary }]} accessibilityRole="button">
          <Text style={{ color: t.onPrimary, fontWeight: "700", fontSize: 13 }}>Choose</Text>
        </Pressable>
      </Card>
    );
  }
  return (
    <Card style={{ gap: 14 }}>
      <Text style={[type.eyebrow, { color: t.muted }]}>Your care team</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={[styles.docAvatar, { backgroundColor: t.primarySoft }]}>
          <Text style={{ color: t.primaryDeep, fontWeight: "800", fontSize: 17 }}>{initials(d?.full_name)}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.headline, { color: t.text }]} numberOfLines={1}>
            {doctorName(d?.full_name)}
          </Text>
          <Text style={{ color: t.muted, fontSize: 13.5 }} numberOfLines={1}>
            {[d?.specialty, d?.hospital].filter(Boolean).join(" · ") || "Your doctor"}
          </Text>
        </View>
        <Pressable
          onPress={() => router.navigate("/care/messages")}
          accessibilityRole="button"
          accessibilityLabel={unread ? `Messages, ${unread} unread` : "Messages"}
          style={[styles.roundBtn, { backgroundColor: t.primaryTint }]}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={t.primary} />
          {unread ? (
            <View style={[styles.badge, { backgroundColor: t.primary, borderColor: t.card }]}>
              <Text style={{ color: t.onPrimary, fontSize: 10.5, fontWeight: "800" }}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <View style={[styles.divider, { backgroundColor: t.hairline }]} />
      <Pressable onPress={() => router.navigate("/account")} style={{ flexDirection: "row", alignItems: "center", gap: 8 }} accessibilityRole="link">
        <Ionicons name="time-outline" size={16} color={t.muted} />
        <Text style={{ color: t.muted, fontSize: 13, flex: 1 }}>Under their care since {timeAgo(link.started_at)}</Text>
        <Text style={{ color: t.primary, fontWeight: "700", fontSize: 13 }}>Records</Text>
        <Ionicons name="chevron-forward" size={14} color={t.primary} />
      </Pressable>
    </Card>
  );
}

export function NewsWidget({ news, loading }: { news: NewsCard | null; loading: boolean }) {
  const t = useTheme();
  if (loading) {
    return (
      <Card>
        <Skeleton lines={3} />
      </Card>
    );
  }
  if (!news) return null;
  const isTip = news.kind === "tip";
  const meta = [news.source, news.published ? timeAgo(news.published) : null].filter(Boolean).join(" · ");
  const open = news.url ? () => void Linking.openURL(news.url!) : undefined;
  return (
    <Pressable onPress={open} disabled={!open} accessibilityRole={open ? "link" : undefined}>
      {({ pressed }) => (
        <Card style={{ gap: 10, opacity: pressed ? 0.9 : 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name={isTip ? "bulb-outline" : "newspaper-outline"} size={15} color={t.primary} />
            <Text style={[type.eyebrow, { color: t.primary, flex: 1 }]} numberOfLines={1}>
              {isTip ? "Daily tip" : `Research · ${news.topic}`}
            </Text>
            {meta && !isTip ? <Text style={{ color: t.subtle, fontSize: 12 }}>{meta}</Text> : null}
          </View>
          <Text style={[type.headline, { color: t.text, lineHeight: 23 }]}>{news.headline}</Text>
          <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }} numberOfLines={3}>
            {news.summary}
          </Text>
          {open ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <Text style={{ color: t.primary, fontWeight: "700", fontSize: 13 }}>Read the article</Text>
              <Ionicons name="arrow-forward" size={14} color={t.primary} />
              <View style={{ flex: 1 }} />
              {news.ai_summary ? <Text style={{ color: t.subtle, fontSize: 11 }}>Plain-language summary</Text> : null}
            </View>
          ) : null}
        </Card>
      )}
    </Pressable>
  );
}

/** Grouped list of secondary tools, iOS-settings style. */
export function ToolList({ items }: { items: Array<{ icon: IconName; title: string; text: string; href: Href }> }) {
  const t = useTheme();
  return (
    <Card style={{ padding: 6, gap: 0 }}>
      {items.map((it, i) => (
        <View key={it.title}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: t.hairline, marginLeft: 66 }]} /> : null}
          <Pressable
            onPress={() => router.navigate(it.href)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.toolRow, { backgroundColor: pressed ? t.primaryTint : "transparent" }]}
          >
            <IconCircle name={it.icon} size={40} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>{it.title}</Text>
              <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>
                {it.text}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.subtle} />
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 6, marginBottom: -6 }}>
      <Text style={[type.headline, { color: t.text, flex: 1, fontSize: 18 }]}>{children}</Text>
      {right}
    </View>
  );
}

export function Skeleton({ lines = 2 }: { lines?: number }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: lines }, (_, i) => (
        <View key={i} style={{ height: i === 0 ? 14 : 11, width: i === 0 ? "45%" : i === lines - 1 ? "70%" : "100%", borderRadius: 6, backgroundColor: t.muted2 }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  hero: { borderRadius: 28, padding: 22, gap: 18, overflow: "hidden" },
  rings: { position: "absolute", top: -40, right: -60 },
  seg: { flex: 1, height: 6, borderRadius: 3 },
  heroPill: { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  monthDot: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  quick: { flex: 1, borderWidth: 1, borderRadius: 22, paddingVertical: 14, alignItems: "center", gap: 8 },
  focus: { flex: 1, borderRadius: 14, paddingVertical: 11, alignItems: "center" },
  smallBtn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  docAvatar: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -3, right: -3, minWidth: 19, height: 19, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  divider: { height: StyleSheet.hairlineWidth * 2 },
  toolRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: 18 },
});
