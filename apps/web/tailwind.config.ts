import type { Config } from "tailwindcss";

/** Deal radar: cool canvas, cobalt actions, lime highlights, teal proof. */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#17203A", soft: "#43516F", mute: "#66728C" },
        paper: { DEFAULT: "#F4F6FB", card: "#FFFFFF", line: "#DCE2EE" },
        tag: { DEFAULT: "#D8F279", deep: "#3549D6", soft: "#F0F9CF" },
        promo: { DEFAULT: "#B93D50", soft: "#FCE9EC" },
        proof: { DEFAULT: "#087D70", soft: "#DDF5EF" },
        forest: { DEFAULT: "#17203A", light: "#273554", line: "#394563" },
        brand: { 50: "#EEF0FF", 100: "#DCE1FF", 500: "#5266E9", 600: "#3549D6", 700: "#283ABB", 900: "#17203A" },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', "system-ui", "Segoe UI", "Roboto", "sans-serif"],
        display: ['"Plus Jakarta Sans Variable"', "system-ui", "sans-serif"],
      },
      fontSize: {
        price: ["1.75rem", { lineHeight: "1", letterSpacing: "-0.02em", fontWeight: "800" }],
      },
    },
  },
  plugins: [],
} satisfies Config;
