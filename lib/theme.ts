export interface ThemeConfig {
  background: string;
  title: string;
  artist: string;
  lyrics: string;
  progressBg: string;
  progressBar: string;
  border: string;
  equalizer: string;
}

export interface StyleConfig extends ThemeConfig {
  borderRadius: number;
}

export const THEMES: Record<string, ThemeConfig> = {
  default: {
    background: "#0d1117",
    title: "#ffffff",
    artist: "#8b949e",
    lyrics: "#1db954",
    progressBg: "#21262d",
    progressBar: "#1db954",
    border: "#30363d",
    equalizer: "#1db954",
  },
  dracula: {
    background: "#282a36",
    title: "#f8f8f2",
    artist: "#6272a4",
    lyrics: "#ff79c6",
    progressBg: "#44475a",
    progressBar: "#bd93f9",
    border: "#6272a4",
    equalizer: "#50fa7b",
  },
  catppuccin: {
    background: "#1e1e2e",
    title: "#cdd6f4",
    artist: "#a6adc8",
    lyrics: "#f5c2e7",
    progressBg: "#313244",
    progressBar: "#cba6f7",
    border: "#45475a",
    equalizer: "#a6e3a1",
  },
  "tokyo-night": {
    background: "#1a1b26",
    title: "#c0caf5",
    artist: "#565f89",
    lyrics: "#7aa2f7",
    progressBg: "#24283b",
    progressBar: "#bb9af7",
    border: "#414868",
    equalizer: "#7dcfff",
  },
  nord: {
    background: "#2e3440",
    title: "#eceff4",
    artist: "#d8dee9",
    lyrics: "#88c0d0",
    progressBg: "#3b4252",
    progressBar: "#81a1c1",
    border: "#4c566a",
    equalizer: "#a3be8c",
  },
  light: {
    background: "#ffffff",
    title: "#24292f",
    artist: "#57606a",
    lyrics: "#0969da",
    progressBg: "#eaeef2",
    progressBar: "#2da44e",
    border: "#d0d7de",
    equalizer: "#1a7f37",
  },
};

const DEFAULT_BORDER_RADIUS = 10;
const MAX_BORDER_RADIUS = 85; // half the card height (170px) — anything past this degenerates the shape

// Query values pass straight into SVG fill/stroke attributes and a <style>
// block, so only accept a tight, unambiguous whitelist: "#rgb"/"#rrggbb"
// (with or without the leading #) or a bare CSS color keyword. Anything
// else is ignored and the theme's own default is kept — this is a public,
// URL-driven input, so silently falling back beats trying to escape and
// pass through arbitrary attacker-controlled CSS/markup.
const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{4}$|^#?[0-9a-fA-F]{6}$|^#?[0-9a-fA-F]{8}$/;
const NAMED_COLOR_PATTERN = /^[a-zA-Z]+$/;

export type QueryValue = string | string[] | undefined;
export type ThemeQuery = Record<string, QueryValue>;

function firstValue(value: QueryValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function sanitizeColor(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();

  if (HEX_COLOR_PATTERN.test(trimmed)) {
    return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  }
  if (NAMED_COLOR_PATTERN.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback;
}

function sanitizeBorderRadius(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_BORDER_RADIUS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_BORDER_RADIUS;
  return Math.min(MAX_BORDER_RADIUS, Math.max(0, parsed));
}

/**
 * Resolves the final card style from URL query parameters: `theme` selects
 * a preset from THEMES (falling back to "default" when missing/unknown),
 * then bg_color/title_color/artist_color/lyrics_color/bar_color/border_color
 * override individual fields on top of it. border_radius controls the
 * card's corner rounding (default 10), and show_border=false makes the
 * border transparent instead of drawing it.
 */
export function parseThemeParams(query: ThemeQuery): StyleConfig {
  const themeName = firstValue(query.theme)?.trim().toLowerCase();
  const baseTheme = (themeName && THEMES[themeName]) || THEMES.default;

  const theme: ThemeConfig = {
    background: sanitizeColor(firstValue(query.bg_color), baseTheme.background),
    title: sanitizeColor(firstValue(query.title_color), baseTheme.title),
    artist: sanitizeColor(firstValue(query.artist_color), baseTheme.artist),
    lyrics: sanitizeColor(firstValue(query.lyrics_color), baseTheme.lyrics),
    progressBg: baseTheme.progressBg,
    progressBar: sanitizeColor(firstValue(query.bar_color), baseTheme.progressBar),
    border: sanitizeColor(firstValue(query.border_color), baseTheme.border),
    equalizer: baseTheme.equalizer,
  };

  const showBorder = firstValue(query.show_border)?.trim().toLowerCase() !== "false";
  if (!showBorder) {
    theme.border = "transparent";
  }

  return {
    ...theme,
    borderRadius: sanitizeBorderRadius(firstValue(query.border_radius)),
  };
}
