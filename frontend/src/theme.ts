// Design tokens for MindEcho — Personality 8 Hand-Drawn / Journal LIGHT.
export const colors = {
  surface: "#F7F6F2",
  onSurface: "#2A2C2A",
  surfaceSecondary: "#EBE9E4",
  onSurfaceSecondary: "#424542",
  surfaceTertiary: "#DFDCD6",
  onSurfaceTertiary: "#515451",
  surfaceInverse: "#2A2C2A",
  onSurfaceInverse: "#F7F6F2",
  brand: "#6E7A65",
  brandPrimary: "#6E7A65",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#8B9683",
  brandTertiary: "#C9CFC5",
  success: "#5C7360",
  warning: "#C49B71",
  error: "#B86B5A",
  border: "#D4D2CD",
  borderStrong: "#B3B1AC",
  divider: "#E3E1DC",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
};

export const font = {
  displayFamily: "serif" as const, // system serif to evoke editorial feel
  textFamily: "System" as const,
  sizes: { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 32 },
};

export const levelColor = (level: string): string => {
  if (level === "High") return colors.error;
  if (level === "Medium") return colors.warning;
  return colors.success;
};
