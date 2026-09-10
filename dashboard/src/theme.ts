/**
 * Motor de tema.
 *
 * El panel se pinta con un solo acento: el del juego que esté corriendo. Ese
 * color viene del catálogo o lo elige el usuario desde el arte del servidor,
 * así que no hay forma de garantizar de antemano que sea legible. En lugar de
 * fijar una paleta de marca, aquí se recalcula el acento contra el fondo del
 * modo activo hasta que pasa AA, moviendo solo la luminosidad para no perder
 * el tono: el verde de Minecraft sigue siendo verde en claro y en oscuro.
 */

export type Mode = "light" | "dark";
export type ModePreference = Mode | "system";

export type ThemeDef = {
  banner: string;
  accent: string;
};

type RGB = [number, number, number];

/** Fondo de página de cada modo. Debe seguir a --bg en index.css. */
const MODE_BG: Record<Mode, RGB> = {
  light: [246, 245, 242],
  dark: [13, 14, 15],
};

/** Los dos tintes de texto disponibles para colocar sobre el acento. */
const INK_ON_ACCENT: Record<"dark" | "light", RGB> = {
  dark: [26, 25, 23],
  light: [255, 255, 254],
};

/** Mínimo WCAG AA para texto normal. */
const AA = 4.5;

const MODE_KEY = "panel:mode";

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    Number.parseInt(full.slice(0, 2), 16) || 0,
    Number.parseInt(full.slice(2, 4), 16) || 0,
    Number.parseInt(full.slice(4, 6), 16) || 0,
  ];
}

/** Luminancia relativa WCAG 2.1 */
function luminance([r, g, b]: RGB): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Ratio de contraste WCAG entre dos colores, de 1 a 21. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue(p, q, h + 1 / 3) * 255),
    Math.round(hue(p, q, h) * 255),
    Math.round(hue(p, q, h - 1 / 3) * 255),
  ];
}

/** El mejor tinte disponible para poner encima de un relleno, y su contraste. */
function bestInk(accent: RGB): { ink: RGB; ratio: number } {
  const onWhite = contrastRatio(INK_ON_ACCENT.light, accent);
  const onBlack = contrastRatio(INK_ON_ACCENT.dark, accent);
  return onWhite >= onBlack
    ? { ink: INK_ON_ACCENT.light, ratio: onWhite }
    : { ink: INK_ON_ACCENT.dark, ratio: onBlack };
}

/**
 * Empuja la luminosidad del acento hasta que cumple dos cosas a la vez: que se
 * lea sobre el fondo del modo (sirve como texto, icono y carril) y que encima
 * de su propio relleno quepa una etiqueta legible.
 *
 * Lo segundo no es gratis. Entre luminancias 0.18 y 0.22 hay una franja muerta
 * en la que ni el blanco ni el casi negro llegan a 4.5:1, y quedarse ahí es
 * fácil: basta parar en cuanto se cumple la primera condición. Por eso el bucle
 * sigue empujando hasta cruzarla. El tono y la saturación no se tocan, que es
 * lo que mantiene reconocible el color del juego.
 */
export function accentForMode(hex: string, mode: Mode): { accent: RGB; ink: RGB } {
  const bg = MODE_BG[mode];
  const [h, s, l0] = rgbToHsl(hexToRgb(hex));

  const step = mode === "light" ? -0.02 : 0.02;
  const limit = mode === "light" ? 0.06 : 0.94;

  let l = l0;
  let accent = hslToRgb(h, s, l);
  const ok = (c: RGB) => contrastRatio(c, bg) >= AA && bestInk(c).ratio >= AA;

  // 50 pasos del 2% cubren el rango completo de luminosidad.
  for (let i = 0; i < 50 && !ok(accent); i++) {
    if (l === limit) break;
    l = mode === "light" ? Math.max(limit, l + step) : Math.min(limit, l + step);
    accent = hslToRgb(h, s, l);
  }

  return { accent, ink: bestInk(accent).ink };
}

/** Temas por defecto de cada juego. El acento es un hex; el modo lo ajusta. */
export const DEFAULT_THEMES: Record<string, ThemeDef> = {
  _idle: { banner: "/themes/ppmatrix.png", accent: "#3b7dd8" },
  minecraft: { banner: "/themes/ppmatrix.png", accent: "#3faa5a" },
  valheim: { banner: "/themes/ppmatrix.png", accent: "#c2792b" },
  terraria: { banner: "/themes/ppmatrix.png", accent: "#8a63d2" },
  _default: { banner: "/themes/ppmatrix.png", accent: "#3b7dd8" },
};

/** Resuelve banner y acento de un juego, con lo que sobreescriba el servidor. */
export function resolveTheme(
  gameType: string | null,
  overrides?: { banner_path?: string | null; accent_color?: string | null },
): ThemeDef {
  const key = gameType && DEFAULT_THEMES[gameType] ? gameType : "_default";
  const base = DEFAULT_THEMES[key];
  return {
    banner: overrides?.banner_path || base.banner,
    accent: overrides?.accent_color || base.accent,
  };
}

/** Escribe el acento ya calibrado en las variables CSS. */
export function applyAccent(hex: string, mode: Mode): void {
  const { accent, ink } = accentForMode(hex, mode);
  const root = document.documentElement;
  root.style.setProperty("--accent", accent.join(" "));
  root.style.setProperty("--accent-ink", ink.join(" "));
}

/** Lo que pide el sistema operativo ahora mismo. */
export function systemMode(): Mode {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readModePreference(): ModePreference {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // localStorage puede estar bloqueado; el sistema decide.
  }
  return "system";
}

export function effectiveMode(pref: ModePreference): Mode {
  return pref === "system" ? systemMode() : pref;
}

/** Fija el modo en el documento y lo recuerda. Devuelve el modo efectivo. */
export function applyMode(pref: ModePreference): Mode {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  try {
    localStorage.setItem(MODE_KEY, pref);
  } catch {
    // Sin persistencia, el modo dura lo que la pestaña.
  }
  return effectiveMode(pref);
}

/** Avisa cuando el sistema cambia de tema, para recalibrar el acento. */
export function watchSystemMode(onChange: (mode: Mode) => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => onChange(e.matches ? "dark" : "light");
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
