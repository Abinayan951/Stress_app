import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { colors } from "@/src/theme";

export default function Index() {
  return (
    <View style={styles.c}>
      <Text style={styles.t}>MindEcho</Text>
      <ActivityIndicator color={colors.brandPrimary} />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 16 },
  t: { fontFamily: "serif", fontSize: 32, color: colors.onSurface, letterSpacing: -0.5 },
});
