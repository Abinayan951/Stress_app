import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { colors, spacing, radius, font } from "@/src/theme";
import { useAuth } from "@/src/auth";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <LinearGradient colors={[colors.brandTertiary, colors.surface]} style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerRow}>
          <Pressable testID="profile-back" onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={20} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.avatarBig}>
          <Text style={styles.initial}>{(user?.name?.[0] || "M").toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <InfoRow icon="calendar" label="Joined" value={user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"} />
        <InfoRow icon="shield" label="Auth" value="Email + password (JWT)" />
        <InfoRow icon="cpu" label="Voice model" value="OpenAI Whisper-1" />
        <InfoRow icon="cpu" label="Analysis model" value="Anthropic Claude Sonnet 4.6" />
        <InfoRow icon="layers" label="Fusion" value="Weighted late fusion (voice 40% · text 60%)" />

        <Pressable testID="profile-signout" onPress={signOut} style={styles.signOut}>
          <Feather name="log-out" size={16} color={colors.error} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}><Feather name={icon} size={16} color={colors.brandPrimary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, alignItems: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: "serif", fontSize: font.sizes.xl, color: colors.onSurface },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  avatarBig: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  initial: { color: colors.onBrandPrimary, fontFamily: "serif", fontSize: 34 },
  name: { fontFamily: "serif", fontSize: 24, color: colors.onSurface, marginTop: spacing.md },
  email: { color: colors.onSurfaceSecondary, marginTop: 2 },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  rowIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowLabel: { color: colors.onSurfaceTertiary, fontSize: 12 },
  rowValue: { color: colors.onSurface, fontSize: font.sizes.base, marginTop: 2 },
  signOut: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: spacing.lg, borderWidth: 1, borderColor: colors.error },
  signOutText: { color: colors.error, fontWeight: "500" },
});
