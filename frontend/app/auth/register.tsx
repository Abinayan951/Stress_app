import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Link } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { colors, spacing, radius, font } from "@/src/theme";
import { useAuth } from "@/src/auth";

export default function Register() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (busy) return;
    setError(null);
    if (!name.trim() || !email.trim() || !password) { setError("All fields are required."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setBusy(true);
    try {
      await signUp(name.trim(), email.trim().toLowerCase(), password);
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      setError(e?.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <LinearGradient colors={[colors.brandTertiary, colors.surface]} style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.brand}>Create account</Text>
        <Text style={styles.tag}>Begin your reflective journal.</Text>
      </LinearGradient>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput testID="register-name-input" value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput testID="register-email-input" value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.onSurfaceTertiary} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput testID="register-password-input" value={password} onChangeText={setPassword} placeholder="At least 6 characters" placeholderTextColor={colors.onSurfaceTertiary} secureTextEntry style={styles.input} />
        </View>
        {error ? <Text testID="register-error" style={styles.err}>{error}</Text> : null}
        <Pressable testID="register-submit-button" onPress={onSubmit} disabled={busy} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}>
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Create account</Text>}
        </Pressable>
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Link href="/auth/login" asChild>
            <Pressable testID="register-go-login"><Text style={styles.linkText}>Sign in</Text></Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  brand: { fontFamily: "serif", fontSize: 30, color: colors.onSurface, letterSpacing: -0.5 },
  tag: { color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  body: { padding: spacing.xl, gap: spacing.md },
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
