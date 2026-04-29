"use client";

export const THEME_STORAGE_KEY = "app-theme";
export const THEME_COOKIE_KEY = "app-theme";

export type ThemeDefinition = {
  key: string;
  label: string;
  from: string;
  via: string;
  to: string;
  accent: string;
  accentHover: string;
  soft: string;
  faint: string;
  ring: string;
  text: string;
  sidebarActiveBg: string;
};

export const THEMES: ThemeDefinition[] = [
  { key: "blue", label: "Xanh dịu", from: "#F8FAFC", via: "#EEF6FF", to: "#FFFFFF", accent: "#2563EB", accentHover: "#1D4ED8", soft: "#DBEAFE", faint: "#EFF6FF", ring: "rgba(37,99,235,0.22)", text: "#FFFFFF", sidebarActiveBg: "#DBEAFE" },
  { key: "mint", label: "Mint", from: "#F8FAFC", via: "#ECFDF5", to: "#FFFFFF", accent: "#059669", accentHover: "#047857", soft: "#D1FAE5", faint: "#ECFDF5", ring: "rgba(5,150,105,0.22)", text: "#FFFFFF", sidebarActiveBg: "#D1FAE5" },
  { key: "rose", label: "Rose", from: "#FFF7F7", via: "#FFF1F2", to: "#FFFFFF", accent: "#E11D48", accentHover: "#BE123C", soft: "#FFE4E6", faint: "#FFF1F2", ring: "rgba(225,29,72,0.22)", text: "#FFFFFF", sidebarActiveBg: "#FFE4E6" },
  { key: "amber", label: "Amber", from: "#FFFBEB", via: "#FEF3C7", to: "#FFFFFF", accent: "#D97706", accentHover: "#B45309", soft: "#FDE68A", faint: "#FFF7ED", ring: "rgba(217,119,6,0.22)", text: "#FFFFFF", sidebarActiveBg: "#FEF3C7" },
  { key: "violet", label: "Violet", from: "#FAF5FF", via: "#F5F3FF", to: "#FFFFFF", accent: "#7C3AED", accentHover: "#6D28D9", soft: "#E9D5FF", faint: "#F5F3FF", ring: "rgba(124,58,237,0.22)", text: "#FFFFFF", sidebarActiveBg: "#E9D5FF" },
  { key: "sky", label: "Sky", from: "#F5FBFF", via: "#E0F2FE", to: "#FFFFFF", accent: "#0284C7", accentHover: "#0369A1", soft: "#BAE6FD", faint: "#F0F9FF", ring: "rgba(2,132,199,0.22)", text: "#FFFFFF", sidebarActiveBg: "#E0F2FE" },
  { key: "emerald", label: "Emerald", from: "#F6FEFA", via: "#D1FAE5", to: "#FFFFFF", accent: "#10B981", accentHover: "#059669", soft: "#A7F3D0", faint: "#ECFDF5", ring: "rgba(16,185,129,0.22)", text: "#FFFFFF", sidebarActiveBg: "#D1FAE5" },
  { key: "teal", label: "Teal", from: "#F3FFFD", via: "#CCFBF1", to: "#FFFFFF", accent: "#0F766E", accentHover: "#115E59", soft: "#99F6E4", faint: "#F0FDFA", ring: "rgba(15,118,110,0.22)", text: "#FFFFFF", sidebarActiveBg: "#CCFBF1" },
  { key: "indigo", label: "Indigo", from: "#F7F8FF", via: "#E0E7FF", to: "#FFFFFF", accent: "#4F46E5", accentHover: "#4338CA", soft: "#C7D2FE", faint: "#EEF2FF", ring: "rgba(79,70,229,0.22)", text: "#FFFFFF", sidebarActiveBg: "#E0E7FF" },
  { key: "slate", label: "Slate", from: "#F8FAFC", via: "#E2E8F0", to: "#FFFFFF", accent: "#475569", accentHover: "#334155", soft: "#CBD5E1", faint: "#F1F5F9", ring: "rgba(71,85,105,0.22)", text: "#FFFFFF", sidebarActiveBg: "#E2E8F0" },
  { key: "peach", label: "Peach", from: "#FFF8F6", via: "#FED7C3", to: "#FFFFFF", accent: "#EA580C", accentHover: "#C2410C", soft: "#FDBA74", faint: "#FFF7ED", ring: "rgba(234,88,12,0.22)", text: "#FFFFFF", sidebarActiveBg: "#FED7C3" },
  { key: "lavender", label: "Lavender", from: "#FBFAFF", via: "#EDE9FE", to: "#FFFFFF", accent: "#8B5CF6", accentHover: "#7C3AED", soft: "#DDD6FE", faint: "#F5F3FF", ring: "rgba(139,92,246,0.22)", text: "#FFFFFF", sidebarActiveBg: "#EDE9FE" }
];

export function resolveTheme(themeKey?: string | null) {
  return THEMES.find((item) => item.key === themeKey) ?? THEMES[0];
}

export function persistTheme(themeKey: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeKey);
  }
  if (typeof document !== "undefined") {
    document.cookie = `${THEME_COOKIE_KEY}=${themeKey}; path=/; max-age=31536000; samesite=lax`;
  }
}

export function readStoredTheme() {
  if (typeof window === "undefined") return THEMES[0].key;
  return window.localStorage.getItem(THEME_STORAGE_KEY) || readThemeCookie() || THEMES[0].key;
}

export function readThemeCookie() {
  if (typeof document === "undefined") return null;
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${THEME_COOKIE_KEY}=`));
  return cookie ? decodeURIComponent(cookie.split("=")[1] || "") : null;
}

export function applyTheme(themeKey: string) {
  const theme = resolveTheme(themeKey);
  const root = document.documentElement;
  root.style.setProperty("--primary", theme.accent);
  root.style.setProperty("--primary-hover", theme.accentHover);
  root.style.setProperty("--primary-soft", theme.soft);
  root.style.setProperty("--primary-faint", theme.faint);
  root.style.setProperty("--primary-ring", theme.ring);
  root.style.setProperty("--primary-text", theme.text);
  root.style.setProperty("--app-bg", `linear-gradient(180deg, ${theme.from} 0%, ${theme.via} 48%, ${theme.to} 100%)`);
  root.style.setProperty("--sidebar-active-bg", theme.sidebarActiveBg);
  root.style.setProperty("--app-accent", theme.accent);
  root.style.setProperty("--app-accent-hover", theme.accentHover);
  root.style.setProperty("--app-accent-soft", theme.soft);
  root.style.setProperty("--app-accent-faint", theme.faint);
  root.style.setProperty("--app-accent-ring", theme.ring);
  root.style.setProperty("--app-accent-contrast", theme.text);
  document.body.style.background = `radial-gradient(circle at top left, ${theme.via}, transparent 28%), linear-gradient(180deg, ${theme.from} 0%, ${theme.via} 48%, ${theme.to} 100%)`;
}
