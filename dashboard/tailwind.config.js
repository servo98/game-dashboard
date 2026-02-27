/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4ff",
          500: "#4f6ef7",
          600: "#3a56d4",
          700: "#2d43b0",
        },
        discord: "#5865F2",
      },
    },
  },
  plugins: [],
};
