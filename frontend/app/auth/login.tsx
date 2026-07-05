import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Link } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { colors, spacing, radius, font } from "@/src/theme";
import { useAuth } from "@/src/auth";

export default function Login() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) { setError("Please enter email and password."); return; }
    setBusy(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <LinearGradient colors={[colors.brandTertiary, colors.surface]} style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.brand}>MindEcho</Text>
        <Text style={styles.tag}>Understand your stress, one echo at a time.</Text>
      </LinearGradient>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>Welcome back</Text>
        <Text style={styles.sub}>Sign in to continue your journal.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            testID="login-email-input"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            testID="login-password-input"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.onSurfaceTertiary}
            secureTextEntry
            style={styles.input}
          />
        </View>

        {error ? <Text testID="login-error" style={styles.err}>{error}</Text> : null}

        <Pressable testID="login-submit-button" onPress={onSubmit} disabled={busy} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}>
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Sign in</Text>}
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>New here?</Text>
          <Link href="/auth/register" asChild>
            <Pressable testID="login-go-register"><Text style={styles.linkText}>Create account</Text></Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  brand: { fontFamily: "serif", fontSize: 34, color: colors.onSurface, letterSpacing: -0.6 },
  tag: { color: colors.onSurfaceSecondary, marginTop: spacing.xs, fontSize: font.sizes.base },
  body: { padding: spacing.xl, gap: spacing.md },
  h1: { fontFamily: "serif", fontSize: 26, color: colors.onSurface },
  sub: { color: colors.onSurfaceSecondary, marginBottom: spacing.md, fontSize: font.sizes.base },
  field: { gap: spacing.xs },
  label: { color: colors.onSurfaceSecondary, fontSize: font.sizes.sm, marginLeft: spacing.xs },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14,
    color: colors.onSurface, fontSize: font.sizes.lg, borderWidth: 1, borderColor: colors.border,
  },
  err: { color: colors.error, marginTop: spacing.sm },
  cta: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center", marginTop: spacing.md },
  ctaText: { color: colors.onBrandPrimary, fontSize: font.sizes.lg, fontWeight: "500" },
  footer: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.xl },
  footerText: { color: colors.onSurfaceSecondary },
  linkText: { color: colors.brandPrimary, fontWeight: "500" },
});
