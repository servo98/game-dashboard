import { describe, expect, it } from "vitest";
import { accentForMode, contrastRatio, DEFAULT_THEMES, resolveTheme } from "./theme";

/** Los mismos fondos que declara index.css para cada modo. */
const BG = {
  light: [246, 245, 242] as [number, number, number],
  dark: [13, 14, 15] as [number, number, number],
};

/** Colores de juego reales, incluidos los que son un problema a propósito. */
const GAME_COLORS = [
  "#3faa5a", // verde Minecraft
  "#c2792b", // ámbar Valheim
  "#8a63d2", // morado Terraria
  "#3b7dd8", // azul por defecto
  "#ffff00", // amarillo puro: ilegible sobre papel sin corregir
  "#0a0a0a", // casi negro: ilegible sobre grafito sin corregir
  "#ffffff",
  "#000000",
];

describe("contrastRatio", () => {
  it("da 21 entre blanco y negro", () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 1);
  });

  it("da 1 para un color contra sí mismo", () => {
    expect(contrastRatio([120, 40, 200], [120, 40, 200])).toBeCloseTo(1, 5);
  });
});

describe("accentForMode", () => {
  for (const hex of GAME_COLORS) {
    it(`deja ${hex} legible sobre el papel del modo claro`, () => {
      const { accent } = accentForMode(hex, "light");
      expect(contrastRatio(accent, BG.light)).toBeGreaterThanOrEqual(4.5);
    });

    it(`deja ${hex} legible sobre el grafito del modo oscuro`, () => {
      const { accent } = accentForMode(hex, "dark");
      expect(contrastRatio(accent, BG.dark)).toBeGreaterThanOrEqual(4.5);
    });

    it(`elige un tinte legible encima del relleno de ${hex}`, () => {
      for (const mode of ["light", "dark"] as const) {
        const { accent, ink } = accentForMode(hex, mode);
        expect(contrastRatio(ink, accent)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("conserva el tono: el verde sigue siendo verde en los dos modos", () => {
    const green = "#3faa5a";
    for (const mode of ["light", "dark"] as const) {
      const [r, g, b] = accentForMode(green, mode).accent;
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    }
  });

  it("oscurece en modo claro y aclara en oscuro", () => {
    // Un color de partida de luminosidad media tiene que moverse en sentidos
    // opuestos según el fondo contra el que se va a leer.
    const mid = "#3b7dd8";
    const light = accentForMode(mid, "light").accent;
    const dark = accentForMode(mid, "dark").accent;
    const sum = (c: [number, number, number]) => c[0] + c[1] + c[2];
    expect(sum(dark)).toBeGreaterThan(sum(light));
  });
});

describe("resolveTheme", () => {
  it("cae al tema por defecto con un juego desconocido", () => {
    expect(resolveTheme("no-existe").accent).toBe(DEFAULT_THEMES._default.accent);
  });

  it("el acento del servidor gana al del catálogo", () => {
    const theme = resolveTheme("minecraft", { accent_color: "#ff0000", banner_path: "/mio.png" });
    expect(theme.accent).toBe("#ff0000");
    expect(theme.banner).toBe("/mio.png");
  });

  it("ignora sobreescrituras vacías", () => {
    const theme = resolveTheme("minecraft", { accent_color: null, banner_path: null });
    expect(theme.accent).toBe(DEFAULT_THEMES.minecraft.accent);
  });
});
