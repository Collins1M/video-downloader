import type { PlatformType } from "./index";

export interface PlatformThemeConfig {
  name: string;
  platform: PlatformType;
  gradientBackground: string;
  borderColor: string;
  glowShadow: string;
  accentColor: string;
  textColor: string;
  badgeLabel: string;
}

export const INSTAGRAM_THEME: PlatformThemeConfig = {
  name: "Instagram",
  platform: "instagram",
  gradientBackground: "linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)",
  borderColor: "#e1306c",
  glowShadow: "0 0 15px rgba(225, 48, 108, 0.4)",
  accentColor: "#e1306c",
  textColor: "#ffffff",
  badgeLabel: "Instagram Video",
};

export const TIKTOK_THEME: PlatformThemeConfig = {
  name: "TikTok",
  platform: "tiktok",
  gradientBackground: "linear-gradient(135deg, #00f2fe 0%, #fe2c55 100%)",
  borderColor: "#00f2fe",
  glowShadow: "-4px 0 12px rgba(0, 242, 254, 0.35), 4px 0 12px rgba(254, 44, 85, 0.35)",
  accentColor: "#fe2c55",
  textColor: "#ffffff",
  badgeLabel: "TikTok Video",
};

export const YOUTUBE_THEME: PlatformThemeConfig = {
  name: "YouTube",
  platform: "youtube",
  gradientBackground: "linear-gradient(135deg, #ff0000 0%, #280000 100%)",
  borderColor: "#ff0000",
  glowShadow: "0 0 12px rgba(255, 0, 0, 0.3)",
  accentColor: "#ff0000",
  textColor: "#ffffff",
  badgeLabel: "YouTube Video",
};

export const PORNHUB_THEME: PlatformThemeConfig = {
  name: "Pornhub",
  platform: "pornhub",
  gradientBackground: "linear-gradient(135deg, #ff9900 0%, #000000 100%)",
  borderColor: "#ff9900",
  glowShadow: "0 0 12px rgba(255, 153, 0, 0.3)",
  accentColor: "#ff9900",
  textColor: "#ffffff",
  badgeLabel: "Adult Video (18+)",
};

export const GENERIC_THEME: PlatformThemeConfig = {
  name: "Video",
  platform: "generic",
  gradientBackground: "linear-gradient(135deg, #3b82f6 0%, #1e1b4b 100%)",
  borderColor: "#6366f1",
  glowShadow: "0 0 10px rgba(99, 102, 241, 0.2)",
  accentColor: "#6366f1",
  textColor: "#ffffff",
  badgeLabel: "Web Video",
};

export function getPlatformTheme(platform?: PlatformType): PlatformThemeConfig {
  switch (platform) {
    case "instagram":
      return INSTAGRAM_THEME;
    case "tiktok":
      return TIKTOK_THEME;
    case "youtube":
      return YOUTUBE_THEME;
    case "pornhub":
      return PORNHUB_THEME;
    default:
      return GENERIC_THEME;
  }
}
