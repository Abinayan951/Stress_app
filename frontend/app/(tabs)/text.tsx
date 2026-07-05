import { useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { colors, spacing, radius, font } from "@/src/theme";
import { api } from "@/src/auth";

const PROMPTS = [
  "What's weighing on you today?",
  "Describe the last hour in a few sentences.",
  "What are you dreading? What are you looking forward to?",
];

export default function TextScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onAnalyze = async () => {
    if (busy) return;
    const t = text.trim();
    if (t.length < 3) { setError("Write at least a sentence."); return; }
    setBusy(true); setError(null);
    try {
      const result = await api.analyzeText(t);
      router.push({ pathname: "/result/[id]", params: { id: result.id } });
    } catch (e: any) {
      setError(e?.message || "Analysis failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>Write it out</Text>
        <Text style={styles.sub}>Type freely. AI will analyze the tone and language for stress signals.</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.editor}>
          <TextInput
            testID="text-input"
            value={text}
            onChangeText={setText}
            placeholder={PROMPTS[0]}
            placeholderTextColor={colors.onSurfaceTertiary}
            multiline
            style={styles.textarea}
            textAlignVertical="top"
          />
          <Text style={styles.count} testID="text-count">{text.length} chars</Text>
        </View>

        <View style={styles.prompts}>
          {PROMPTS.map((p, i) => (
            <Pressable key={i} testID={`text-prompt-${i}`} onPress={() => setText(p + "\n\n")} style={styles.prompt}>
              <Feather name="feather" size={12} color={colors.brandPrimary} />
              <Text style={styles.promptText}>{p}</Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text testID="text-error" style={styles.err}>{error}</Text> : null}

        <Pressable testID="text-analyze-button" onPress={onAnalyze} disabled={busy} style={styles.cta}>
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
            <>
              <Feather name="cpu" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.ctaText}>Analyze text</Text>
            </>
          )}
        </Pressable>

        {busy ? <Text style={styles.mut}>Reading between the lines…</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontFamily: "serif", fontSize: 28, color: colors.onSurface, letterSpacing: -0.3 },
  sub: { color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  body: { padding: spacing.lg, gap: spacing.md },
  editor: { position: "relative" },
  textarea: {
    minHeight: 240, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, color: colors.onSurface, fontSize: font.sizes.lg, borderWidth: 1, borderColor: colors.border,
  },
  count: { position: "absolute", right: spacing.md, bottom: spacing.md, color: colors.onSurfaceTertiary, fontSize: 12 },
  prompts: { gap: spacing.sm },
  prompt: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider },
  promptText: { color: colors.onSurfaceSecondary, flex: 1 },
  err: { color: colors.error, textAlign: "center" },
  cta: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  ctaText: { color: colors.onBrandPrimary, fontSize: font.sizes.lg, fontWeight: "500" },
  mut: { color: colors.onSurfaceSecondary, textAlign: "center" },
});
