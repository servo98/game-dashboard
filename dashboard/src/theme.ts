/** Theme engine — maps game types to colors + banners */

export type ThemeColors = {
  50: string; // RGB triplet e.g. "240 244 255"
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
};

export type ThemeDef = {
  banner: string;
  colors: ThemeColors;
};

/** Parse hex "#rrggbb" → [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** RGB triplet string for CSS vars */
function rgbStr(r: number, g: number, b: number): string {
  return `${r} ${g} ${b}`;
}

/** Lighten/darken by mixing with white or black */
function mix(
  [r, g, b]: [number, number, number],
  [tr, tg, tb]: [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    Math.round(r + (tr - r) * amount),
    Math.round(g + (tg - g) * amount),
    Math.round(b + (tb - b) * amount),
  ];
}

/** Generate a full shade palette from a single hex color (used as 500) */
export function generatePalette(hex: string): ThemeColors {
  const base = hexToRgb(hex);
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];

  const shade50 = mix(base, white, 0.88);
  const shade300 = mix(base, white, 0.4);
  const shade400 = mix(base, white, 0.2);
  const shade500 = base;
  const shade600 = mix(base, black, 0.2);
  const shade700 = mix(base, black, 0.38);

  return {
    50: rgbStr(...shade50),
    300: rgbStr(...shade300),
    400: rgbStr(...shade400),
    500: rgbStr(...shade500),
    600: rgbStr(...shade600),
    700: rgbStr(...shade700),
  };
}

/** Default themes per game type */
export const DEFAULT_THEMES: Record<string, ThemeDef> = {
  _idle: {
    banner: "/themes/pepebot banner.jpg",
    colors: generatePalette("#22c55e"),
  },
  minecraft: {
    banner: "/themes/ppmc.png",
    colors: generatePalette("#4ade80"),
  },
  valheim: {
    banner: "/themes/pepeviking.png",
    colors: generatePalette("#f59e0b"),
  },
  terraria: {
    banner: "/themes/ppterra.png",
    colors: generatePalette("#a855f7"),
  },
  _default: {
    banner: "/themes/pepebot banner.jpg",
    colors: generatePalette("#4f6ef7"),
  },
};

/** Apply a color palette to the document CSS variables */
export function applyTheme(colors: ThemeColors): void {
  const root = document.documentElement;
  root.style.setProperty("--brand-50", colors[50]);
  root.style.setProperty("--brand-300", colors[300]);
  root.style.setProperty("--brand-400", colors[400]);
  root.style.setProperty("--brand-500", colors[500]);
  root.style.setProperty("--brand-600", colors[600]);
  root.style.setProperty("--brand-700", colors[700]);
}

/** Resolve the theme for a given game type, with optional per-server overrides */
export function resolveTheme(
  gameType: string | null,
  overrides?: { banner_path?: string | null; accent_color?: string | null },
): ThemeDef {
  // Pick base theme: specific game → _default
  const key = gameType && DEFAULT_THEMES[gameType] ? gameType : "_default";
  const base = DEFAULT_THEMES[key];

  const banner = overrides?.banner_path || base.banner;
  const colors = overrides?.accent_color ? generatePalette(overrides.accent_color) : base.colors;

  return { banner, colors };
}
