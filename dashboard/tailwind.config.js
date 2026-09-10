/** @type {import('tailwindcss').Config} */

/* Un solo acento por pantalla (el del juego activo). Los neutros llevan
   temperatura propia — papel cálido en claro, grafito frío en oscuro — para
   no caer en el gris Tailwind de fábrica. */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        raised: token("raised"),
        line: token("line"),
        "line-strong": token("line-strong"),
        ink: token("ink"),
        muted: token("muted"),
        faint: token("faint"),
        accent: token("accent"),
        "accent-ink": token("accent-ink"),
        ok: token("ok"),
        "ok-ink": token("ok-ink"),
        warn: token("warn"),
        "warn-ink": token("warn-ink"),
        danger: token("danger"),
        "danger-ink": token("danger-ink"),
        discord: "#5865F2",
      },
      fontFamily: {
        sans: [
          '"Archivo Variable"',
          "Archivo",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          '"IBM Plex Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      /* Escala real: cada paso tiene un trabajo. Nada de text-xs para todo. */
      fontSize: {
        micro: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.09em" }],
        meta: ["0.75rem", { lineHeight: "1.35" }],
        body: ["0.8125rem", { lineHeight: "1.5" }],
        title: ["0.9375rem", { lineHeight: "1.25", letterSpacing: "-0.011em" }],
        display: ["1.1875rem", { lineHeight: "1.15", letterSpacing: "-0.021em" }],
        hero: ["1.75rem", { lineHeight: "1.08", letterSpacing: "-0.032em" }],
      },
      /* Una regla y solo una: campos 7, tarjetas 10, superficies grandes 14. */
      borderRadius: {
        xs: "3px",
        sm: "5px",
        DEFAULT: "7px",
        md: "7px",
        lg: "10px",
        xl: "14px",
        "2xl": "14px",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(.2,.8,.2,1)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
        slow: "380ms",
      },
      spacing: {
        sidebar: "15rem",
      },
    },
  },
  plugins: [],
};
