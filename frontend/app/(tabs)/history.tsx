import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { colors, spacing, radius, font, levelColor } from "@/src/theme";
import { api, Analysis } from "@/src/auth";

export default function History() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "voice" | "text" | "multimodal">("all");

  const load = useCallback(async () => {
    try { setItems(await api.history()); } catch { /* ignore */ }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load().finally(() => setLoading(false)); }, [load]));

  const filtered = filter === "all" ? items : items.filter(i => i.modality === filter);

  const chips: { key: typeof filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "voice", label: "Voice" },
    { key: "text", label: "Text" },
    { key: "multimodal", label: "Fusion" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>Your journal</Text>
        <Text style={styles.sub}>All your reflections, in one timeline.</Text>
      </View>

      <View style={styles.filterWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={chips}
          keyExtractor={c => c.key}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
          renderItem={({ item }) => {
            const active = item.key === filter;
            return (
              <Pressable
                testID={`filter-${item.key}`}
                onPress={() => setFilter(item.key)}
                style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
              >
                <Text style={[styles.chipText, active && { color: colors.onBrandPrimary }]}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Feather name="feather" size={40} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyTitle}>Your journal is clear.</Text>
          <Text style={styles.emptySub}>Start by making an entry.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, paddingTop: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => (
            <Pressable
              testID={`history-item-${item.id}`}
              onPress={() => router.push({ pathname: "/result/[id]", params: { id: item.id } })}
              style={styles.row}
            >
              <View style={styles.timeline}>
                <View style={[styles.timelineDot, { backgroundColor: levelColor(item.stress_level) }]} />
              </View>
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.iconWrap}>
                    <Feather name={item.modality === "voice" ? "mic" : item.modality === "text" ? "edit-3" : "layers"} size={16} color={colors.brandPrimary} />
                  </View>
                  <Text style={styles.modality}>{item.modality === "multimodal" ? "Fusion" : item.modality[0].toUpperCase() + item.modality.slice(1)}</Text>
                  <Text style={[styles.level, { color: levelColor(item.stress_level) }]}>{item.stress_level}</Text>
                </View>
                <Text numberOfLines={2} style={styles.snippet}>{item.transcript || item.original_text || item.explanation}</Text>
                <Text style={styles.time}>{formatDate(item.created_at)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontFamily: "serif", fontSize: 28, color: colors.onSurface, letterSpacing: -0.3 },
  sub: { color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  filterWrap: { height: 56, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.divider },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipInactive: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipText: { color: colors.onSurface, fontSize: font.sizes.sm, fontWeight: "500" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontFamily: "serif", fontSize: font.sizes.xl, color: colors.onSurface, marginTop: spacing.md },
  emptySub: { color: colors.onSurfaceSecondary },
  row: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  timeline: { width: 20, alignItems: "center", paddingTop: 18 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: colors.surface },
  card: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  modality: { color: colors.onSurface, fontWeight: "500" },
  level: { marginLeft: "auto", fontWeight: "500" },
  snippet: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, lineHeight: 18 },
  time: { color: colors.onSurfaceTertiary, marginTop: spacing.sm, fontSize: 11 },
});
