import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";

import { colors, spacing, radius, font, levelColor } from "@/src/theme";
import { api, Analysis, Stats, useAuth } from "@/src/auth";

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [latest, setLatest] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([api.stats(), api.history()]);
      setStats(s);
      setLatest(h[0] || null);
    } catch {
      // ignore
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const maxBar = Math.max(0.2, ...(stats?.weekly.map(w => w.avg_probability) || [0.2]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <LinearGradient colors={[colors.brandTertiary, colors.surface]} style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hi}>Hello, {user?.name?.split(" ")[0] || "friend"}</Text>
            <Text style={styles.subtitle}>How is your mind today?</Text>
          </View>
          <Pressable testID="dashboard-profile-button" onPress={() => router.push("/profile")} style={styles.avatar}>
            <Feather name="user" size={18} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator color={colors.brandPrimary} /><Text style={styles.mut}>Gathering insights…</Text></View>
        ) : (
          <>
            {/* Latest hero card */}
            <View style={styles.heroCard} testID="dashboard-latest-card">
              <Text style={styles.cardEyebrow}>Latest reflection</Text>
              {latest ? (
                <>
                  <View style={styles.levelRow}>
                    <View style={[styles.dot, { backgroundColor: levelColor(latest.stress_level) }]} />
                    <Text style={[styles.levelText, { color: levelColor(latest.stress_level) }]}>{latest.stress_level} stress</Text>
                    <Text style={styles.probText}>{Math.round(latest.probability * 100)}%</Text>
                  </View>
                  <Text style={styles.badge}>Predicted via {latest.modality === "multimodal" ? "Voice & Text" : latest.modality.charAt(0).toUpperCase() + latest.modality.slice(1)}</Text>
                  <Text style={styles.explanation} numberOfLines={3}>{latest.explanation}</Text>
                  <Pressable testID="dashboard-view-latest" onPress={() => router.push({ pathname: "/result/[id]", params: { id: latest.id } })} style={styles.viewMore}>
                    <Text style={styles.viewMoreText}>View details</Text>
                    <Feather name="arrow-right" size={16} color={colors.brandPrimary} />
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.empty}>Log your first entry to see your stress trends.</Text>
                </>
              )}
            </View>

            {/* Actions */}
            <View style={styles.actionRow}>
              <Pressable testID="dashboard-new-voice" onPress={() => router.push("/(tabs)/voice")} style={[styles.actionCard, { backgroundColor: colors.surfaceSecondary }]}>
                <Feather name="mic" size={22} color={colors.brandPrimary} />
                <Text style={styles.actionTitle}>New voice</Text>
                <Text style={styles.actionSub}>Speak your mind</Text>
              </Pressable>
              <Pressable testID="dashboard-new-text" onPress={() => router.push("/(tabs)/text")} style={[styles.actionCard, { backgroundColor: colors.surfaceSecondary }]}>
                <Feather name="edit-3" size={22} color={colors.brandPrimary} />
                <Text style={styles.actionTitle}>New text</Text>
                <Text style={styles.actionSub}>Write a note</Text>
              </Pressable>
            </View>

            {/* Stats */}
            <View style={styles.statsCard}>
              <Text style={styles.cardEyebrow}>This week</Text>
              <View style={styles.statsRow}>
                <View style={styles.stat}><Text style={styles.statNum} testID="stats-total">{stats?.total ?? 0}</Text><Text style={styles.statLabel}>Entries</Text></View>
                <View style={styles.stat}><Text style={styles.statNum} testID="stats-percentage">{stats?.stress_percentage ?? 0}%</Text><Text style={styles.statLabel}>Stressed</Text></View>
                <View style={styles.stat}><Text style={[styles.statNum, { color: colors.error }]} testID="stats-high">{stats?.by_level.High ?? 0}</Text><Text style={styles.statLabel}>High</Text></View>
              </View>

              {/* Weekly bars */}
              <View style={styles.chart}>
                {stats?.weekly.map((w, i) => {
                  const h = 8 + (w.avg_probability / maxBar) * 80;
                  const c = w.avg_probability < 0.34 ? colors.success : w.avg_probability < 0.67 ? colors.warning : colors.error;
                  const label = w.day_offset === 0 ? "Today" : `${w.day_offset}d`;
                  return (
                    <View key={i} style={styles.barCol}>
                      <View style={[styles.bar, { height: h, backgroundColor: w.count ? c : colors.border }]} />
                      <Text style={styles.barLabel}>{label}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Level distribution */}
              <View style={styles.distRow}>
                <DistItem label="Low" value={stats?.by_level.Low ?? 0} color={colors.success} />
                <DistItem label="Medium" value={stats?.by_level.Medium ?? 0} color={colors.warning} />
                <DistItem label="High" value={stats?.by_level.High ?? 0} color={colors.error} />
              </View>
            </View>

            <Pressable testID="dashboard-logout" onPress={signOut} style={styles.logout}>
              <Feather name="log-out" size={16} color={colors.onSurfaceSecondary} />
              <Text style={styles.logoutText}>Sign out</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DistItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginBottom: 4 }} />
      <Text style={{ fontFamily: "serif", fontSize: 18, color: colors.onSurface }}>{value}</Text>
      <Text style={{ color: colors.onSurfaceSecondary, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  hi: { fontFamily: "serif", fontSize: 26, color: colors.onSurface, letterSpacing: -0.3 },
  subtitle: { color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  loadingBox: { padding: spacing.xxl, alignItems: "center", gap: spacing.md },
  mut: { color: colors.onSurfaceSecondary },
  heroCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardEyebrow: { color: colors.onSurfaceTertiary, textTransform: "uppercase", letterSpacing: 1, fontSize: 11 },
  levelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  dot: { width: 12, height: 12, borderRadius: 6 },
  levelText: { fontFamily: "serif", fontSize: 22, fontWeight: "500" },
  probText: { marginLeft: "auto", color: colors.onSurfaceSecondary, fontSize: font.sizes.base },
  badge: { alignSelf: "flex-start", backgroundColor: colors.brandTertiary, color: colors.onBrandTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, marginTop: spacing.sm, overflow: "hidden", fontSize: 11 },
  explanation: { marginTop: spacing.md, color: colors.onSurfaceSecondary, lineHeight: 20 },
  empty: { marginTop: spacing.md, color: colors.onSurfaceSecondary },
  viewMore: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.md },
  viewMoreText: { color: colors.brandPrimary, fontWeight: "500" },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  actionCard: { flex: 1, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  actionTitle: { fontFamily: "serif", fontSize: font.sizes.lg, color: colors.onSurface, marginTop: spacing.xs },
  actionSub: { color: colors.onSurfaceSecondary, fontSize: font.sizes.sm },
  statsCard: { marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  statsRow: { flexDirection: "row", marginTop: spacing.md, gap: spacing.md },
  stat: { flex: 1, alignItems: "center" },
  statNum: { fontFamily: "serif", fontSize: 26, color: colors.onSurface },
  statLabel: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 110, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
  barCol: { alignItems: "center", flex: 1 },
  bar: { width: 14, borderRadius: 8 },
  barLabel: { color: colors.onSurfaceTertiary, fontSize: 10, marginTop: 4 },
  distRow: { flexDirection: "row", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  logout: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center", marginTop: spacing.xl, padding: spacing.md },
  logoutText: { color: colors.onSurfaceSecondary },
});
