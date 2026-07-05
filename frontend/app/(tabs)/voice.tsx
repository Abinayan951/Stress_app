import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation, Easing } from "react-native-reanimated";
import { AudioModule, useAudioRecorder, RecordingPresets } from "expo-audio";

import { colors, spacing, radius, font } from "@/src/theme";
import { api } from "@/src/auth";

export default function VoiceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [permissionOk, setPermissionOk] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pulse = useSharedValue(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        setPermissionOk(!!status.granted);
      } catch {
        setPermissionOk(false);
      }
    })();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const startPulse = () => {
    pulse.value = withRepeat(withTiming(1.15, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  };
  const stopPulse = () => {
    cancelAnimation(pulse); pulse.value = withTiming(1, { duration: 200 });
  };

  const onToggle = async () => {
    setError(null);
    if (!permissionOk) {
      const s = await AudioModule.requestRecordingPermissionsAsync();
      if (!s.granted) { setError("Microphone permission is required."); return; }
      setPermissionOk(true);
    }
    try {
      if (!isRecording) {
        await recorder.prepareToRecordAsync();
        recorder.record();
        setIsRecording(true);
        setDuration(0);
        setUri(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        startPulse();
        timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await recorder.stop();
        setIsRecording(false);
        stopPulse();
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setUri(recorder.uri || null);
      }
    } catch (e: any) {
      setIsRecording(false); stopPulse();
      setError(e?.message || "Recording failed");
    }
  };

  const onAnalyze = async () => {
    if (!uri || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await api.analyzeVoice(uri);
      router.replace({ pathname: "/result/[id]", params: { id: result.id } });
    } catch (e: any) {
      setError(e?.message || "Analysis failed");
    } finally {
      setBusy(false);
    }
  };

  const mm = String(Math.floor(duration / 60)).padStart(2, "0");
  const ss = String(duration % 60).padStart(2, "0");

  return (
    <View style={[styles.c, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Voice reflection</Text>
        <Text style={styles.sub}>How are you feeling right now?</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.recBox}>
          <Animated.View style={[styles.pulseRing, pulseStyle, { opacity: isRecording ? 0.4 : 0 }]} />
          <Pressable testID="voice-record-button" onPress={onToggle} disabled={busy} style={[styles.recBtn, isRecording && { backgroundColor: colors.error }]}>
            <Feather name={isRecording ? "square" : "mic"} size={44} color={colors.onBrandPrimary} />
          </Pressable>
          <Text style={styles.timer} testID="voice-timer">{mm}:{ss}</Text>
          <Text style={styles.hint}>
            {isRecording ? "Tap to stop" : uri ? "Recording ready — tap Analyze" : "Tap the mic to start"}
          </Text>
        </View>

        {error ? <Text testID="voice-error" style={styles.err}>{error}</Text> : null}

        {uri && !isRecording ? (
          <Pressable testID="voice-analyze-button" onPress={onAnalyze} disabled={busy} style={styles.cta}>
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Feather name="cpu" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.ctaText}>Analyze recording</Text>
              </>
            )}
          </Pressable>
        ) : null}

        {busy ? <Text style={styles.mut}>Transcribing with Whisper, then analyzing with Claude…</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  header: { paddingBottom: spacing.lg },
  title: { fontFamily: "serif", fontSize: 28, color: colors.onSurface, letterSpacing: -0.3 },
  sub: { color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  body: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.xl },
  recBox: { alignItems: "center", gap: spacing.md, height: 280, justifyContent: "center" },
  recBtn: { width: 140, height: 140, borderRadius: 70, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", elevation: 2 },
  pulseRing: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: colors.brandSecondary },
  timer: { fontFamily: "serif", fontSize: 32, color: colors.onSurface, marginTop: spacing.md },
  hint: { color: colors.onSurfaceSecondary },
  err: { color: colors.error, textAlign: "center" },
  cta: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 16, paddingHorizontal: 32, alignItems: "center" },
  ctaText: { color: colors.onBrandPrimary, fontSize: font.sizes.lg, fontWeight: "500" },
  mut: { color: colors.onSurfaceSecondary, textAlign: "center" },
});
