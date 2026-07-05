import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { colors, spacing, radius, font, levelColor } from "@/src/theme";
import { api, Analysis } from "@/src/auth";

export default function ResultScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<Analysis | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (id) setItem(await api.historyDetail(id));
      } catch {
        setToast("Could not load this entry.");
      }
    })();
  }, [id]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/dashboard");
  };

  if (!item) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} />
        <Pressable testID="result-back-loading" onPress={goBack} style={[styles.iconBtn, { marginTop: spacing.lg }]}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
      </View>
    );
  }

  const color = levelColor(item.stress_level);
  const words = new Set(item.highlighted_words.map(w => w.toLowerCase()));
  const source = item.transcript || item.original_text || "";

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await api.deleteHistory(item.id);
      setConfirmOpen(false);
      setToast("Entry deleted.");
      // navigate to history so the list refreshes
      setTimeout(() => router.replace("/(tabs)/history"), 250);
    } catch (e: any) {
      setConfirmOpen(false);
      setToast(e?.message || "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const onExportPDF = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const html = buildReportHtml(item);
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "MindEcho Report" });
      } else {
        setToast("PDF ready, but sharing isn't available on this device.");
      }
    } catch (e: any) {
      setToast(e?.message || "Could not create PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <LinearGradient colors={[colors.brandTertiary, colors.surface]} style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerRow}>
          <Pressable testID="result-back" onPress={goBack} style={styles.iconBtn}>
            <Feather name="arrow-left" size={20} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>Analysis</Text>
          <Pressable testID="result-delete" onPress={() => setConfirmOpen(true)} style={styles.iconBtn}>
            <Feather name="trash-2" size={18} color={colors.error} />
          </Pressable>
        </View>

        <View style={styles.heroInner}>
          <Text style={styles.eyebrow}>Stress level</Text>
          <Text testID="result-level" style={[styles.level, { color }]}>{item.stress_level}</Text>
          <Text style={styles.prob} testID="result-probability">{Math.round(item.probability * 100)}% probability</Text>
          <View style={styles.badge}>
            <Feather name={item.modality === "voice" ? "mic" : item.modality === "text" ? "edit-3" : "layers"} size={12} color={colors.onBrandTertiary} />
            <Text style={styles.badgeText}>
              Predicted via {item.modality === "multimodal" ? "Voice & Text" : item.modality.charAt(0).toUpperCase() + item.modality.slice(1)}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}>
        {/* Done button — obvious way out */}
        <Pressable testID="result-done" onPress={() => router.replace("/(tabs)/dashboard")} style={styles.secondaryBtn}>
          <Feather name="check" size={16} color={colors.brandPrimary} />
          <Text style={styles.secondaryBtnText}>Done — back to journal</Text>
        </Pressable>

        {/* Fusion breakdown */}
        {item.modality === "multimodal" && item.voice_probability != null && item.text_probability != null ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Fusion breakdown</Text>
            <View style={styles.fusionRow}>
              <FusionBar label="Voice" value={item.voice_probability} weight="40%" />
              <FusionBar label="Text" value={item.text_probability} weight="60%" />
            </View>
          </View>
        ) : null}

        {/* Why */}
        <Pressable style={styles.card} onPress={() => setExpanded(e => !e)} testID="result-expand-why">
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Why this prediction?</Text>
            <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.onSurfaceSecondary} />
          </View>
          {expanded ? (
            <>
              <Text style={styles.explanation}>{item.explanation}</Text>
              <View style={styles.features}>
                {item.key_features.map((f, i) => (
                  <View key={i} style={styles.featureRow}>
                    <View style={[styles.featureDot, { backgroundColor: color }]} />
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </Pressable>

        {/* Highlighted source */}
        {source ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.transcript ? "Transcript" : "Your words"}</Text>
            <Text style={styles.source} testID="result-source">
              {splitWords(source).map((tok, i) => {
                const isW = tok.type === "word";
                const hit = isW && words.has(tok.value.toLowerCase().replace(/[^a-z']/g, ""));
                return (
                  <Text key={i} style={hit ? { backgroundColor: color + "33", color: colors.onSurface, fontWeight: "600" } : { color: colors.onSurfaceSecondary }}>
                    {tok.value}
                  </Text>
                );
              })}
            </Text>
          </View>
        ) : null}

        {/* Recommendation */}
        {item.recommendation ? (
          <View style={[styles.card, { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary }]}>
            <View style={styles.recRow}>
              <Feather name="heart" size={18} color={colors.brandPrimary} />
              <Text style={[styles.cardTitle, { marginTop: 0 }]}>A gentle nudge</Text>
            </View>
            <Text style={[styles.explanation, { color: colors.onBrandTertiary }]}>{item.recommendation}</Text>
          </View>
        ) : null}

        {/* Export */}
        <Pressable testID="result-export-pdf" onPress={onExportPDF} disabled={busy} style={styles.cta}>
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
            <>
              <Feather name="download" size={16} color={colors.onBrandPrimary} />
              <Text style={styles.ctaText}>Download PDF report</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      {/* Confirm delete modal */}
      <Modal transparent visible={confirmOpen} animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <Pressable style={styles.modalScrim} onPress={() => !deleting && setConfirmOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalIcon}><Feather name="trash-2" size={22} color={colors.error} /></View>
            <Text style={styles.modalTitle}>Delete this entry?</Text>
            <Text style={styles.modalBody}>This reflection will be permanently removed from your journal.</Text>
            <View style={styles.modalBtnRow}>
              <Pressable testID="delete-cancel" onPress={() => setConfirmOpen(false)} disabled={deleting} style={[styles.modalBtn, styles.modalBtnGhost]}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable testID="delete-confirm" onPress={confirmDelete} disabled={deleting} style={[styles.modalBtn, styles.modalBtnDanger]}>
                {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnDangerText}>Delete</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Toast */}
      {toast ? (
        <Pressable
          testID="result-toast"
          onPress={() => setToast(null)}
          style={[styles.toast, { bottom: insets.bottom + spacing.lg }]}
        >
          <Text style={styles.toastText}>{toast}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FusionBar({ label, value, weight }: { label: string; value: number; weight: string }) {
  const c = levelColor(value < 0.34 ? "Low" : value < 0.67 ? "Medium" : "High");
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: colors.onSurface, fontWeight: "500" }}>{label}</Text>
        <Text style={{ color: colors.onSurfaceTertiary, fontSize: 12 }}>{weight}</Text>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
        <View style={{ width: `${Math.round(value * 100)}%`, height: "100%", backgroundColor: c }} />
      </View>
      <Text style={{ color: colors.onSurfaceSecondary, fontSize: 12 }}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

function splitWords(text: string): { type: "word" | "space"; value: string }[] {
  const out: { type: "word" | "space"; value: string }[] = [];
  const re = /(\s+)/g;
  const parts = text.split(re);
  for (const p of parts) {
    if (!p) continue;
    out.push({ type: /\s+/.test(p) ? "space" : "word", value: p });
  }
  return out;
}

function buildReportHtml(item: Analysis): string {
  const c = item.stress_level === "High" ? "#B86B5A" : item.stress_level === "Medium" ? "#C49B71" : "#5C7360";
  const escape = (s: string) => (s || "").replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" } as any)[ch]);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Georgia,serif;color:#2A2C2A;background:#F7F6F2;padding:32px}
    h1{font-size:28px;margin:0 0 4px}
    .sub{color:#515451;margin-bottom:24px}
    .level{font-size:36px;color:${c};font-weight:600}
    .badge{display:inline-block;padding:4px 10px;background:#C9CFC5;color:#2A2C2A;border-radius:999px;font-size:12px;margin-top:8px}
    .card{background:#EBE9E4;border:1px solid #D4D2CD;border-radius:12px;padding:16px;margin:16px 0}
    h2{font-size:16px;margin:0 0 8px}
    li{margin:4px 0;color:#424542}
    .hl{background:${c}33;padding:1px 2px;border-radius:3px;font-weight:600}
  </style></head><body>
    <h1>MindEcho — Stress Analysis Report</h1>
    <div class="sub">${new Date(item.created_at).toLocaleString()}</div>
    <div class="level">${item.stress_level} · ${Math.round(item.probability * 100)}%</div>
    <div class="badge">Modality: ${item.modality === "multimodal" ? "Voice & Text (Fusion)" : item.modality}</div>
    ${item.modality === "multimodal" ? `<div class="card"><h2>Fusion breakdown</h2>
      <div>Voice: ${Math.round((item.voice_probability || 0) * 100)}% · weight 40%</div>
      <div>Text: ${Math.round((item.text_probability || 0) * 100)}% · weight 60%</div></div>` : ""}
    <div class="card"><h2>Why this prediction?</h2>
      <div>${escape(item.explanation)}</div>
      <ul>${item.key_features.map(f => `<li>${escape(f)}</li>`).join("")}</ul>
    </div>
    ${item.transcript || item.original_text ? `<div class="card"><h2>${item.transcript ? "Transcript" : "Your words"}</h2>
      <div style="white-space:pre-wrap;line-height:1.5">${escape(item.transcript || item.original_text || "")}</div></div>` : ""}
    ${item.highlighted_words.length ? `<div class="card"><h2>Words that stood out</h2>
      <div>${item.highlighted_words.map(w => `<span class="hl">${escape(w)}</span>`).join(" ")}</div></div>` : ""}
    ${item.recommendation ? `<div class="card"><h2>A gentle nudge</h2><div>${escape(item.recommendation)}</div></div>` : ""}
    <div class="sub" style="margin-top:32px;font-size:11px">Generated by MindEcho — a multimodal AI journal.</div>
  </body></html>`;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  hero: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: "serif", fontSize: font.sizes.xl, color: colors.onSurface },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  heroInner: { alignItems: "center", gap: 4 },
  eyebrow: { color: colors.onSurfaceTertiary, textTransform: "uppercase", letterSpacing: 1, fontSize: 11 },
  level: { fontFamily: "serif", fontSize: 48, fontWeight: "500" },
  prob: { color: colors.onSurfaceSecondary },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, marginTop: spacing.sm },
  badgeText: { color: colors.onBrandTertiary, fontSize: 11 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontFamily: "serif", fontSize: font.sizes.lg, color: colors.onSurface, marginTop: 0 },
  explanation: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, lineHeight: 20 },
  features: { marginTop: spacing.md, gap: spacing.sm },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  featureDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  featureText: { flex: 1, color: colors.onSurfaceSecondary, lineHeight: 20 },
  source: { marginTop: spacing.sm, lineHeight: 22, fontSize: font.sizes.lg },
  recRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  fusionRow: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md },
  cta: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  ctaText: { color: colors.onBrandPrimary, fontSize: font.sizes.lg, fontWeight: "500" },
  secondaryBtn: { flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brandPrimary },
  secondaryBtnText: { color: colors.brandPrimary, fontWeight: "500", fontSize: font.sizes.base },
  modalScrim: { flex: 1, backgroundColor: "rgba(42,44,42,0.55)", alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  modalCard: { width: "100%", maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  modalIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontFamily: "serif", fontSize: font.sizes.xl, color: colors.onSurface, textAlign: "center" },
  modalBody: { color: colors.onSurfaceSecondary, textAlign: "center" },
  modalBtnRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm, alignSelf: "stretch" },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  modalBtnGhost: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  modalBtnGhostText: { color: colors.onSurface, fontWeight: "500" },
  modalBtnDanger: { backgroundColor: colors.error },
  modalBtnDangerText: { color: "#fff", fontWeight: "500" },
  toast: { position: "absolute", left: spacing.lg, right: spacing.lg, backgroundColor: colors.onSurface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, elevation: 6 },
  toastText: { color: colors.onSurfaceInverse, textAlign: "center" },
});
