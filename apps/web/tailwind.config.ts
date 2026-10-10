import type { Config } from "tailwindcss";

/**
 * Visual identity: a hypermarket shelf label. Navy ink on cool paper, the
 * yellow promo tag carries the price, red marks the advertised discount and
 * green only what our own price history proves.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#14213D", soft: "#3A4663", mute: "#6B7590" },
        paper: { DEFAULT: "#F2F4F8", card: "#FFFFFF", line: "#DDE2EC" },
        tag: { DEFAULT: "#FFD23F", deep: "#F2B705", soft: "#FFF4C7" },
        promo: { DEFAULT: "#E5383B", soft: "#FDE8E8" },
        proof: { DEFAULT: "#13865A", soft: "#E3F4EC" },
        // Kept for existing pages: primary actions in ink.
        brand: { 50: "#EEF1F7", 100: "#DDE2EC", 500: "#3A4663", 600: "#14213D", 700: "#0E1830", 900: "#0A1124" },
      },
      fontFamily: {
        sans: ['"Instrument Sans Variable"', "system-ui", "Segoe UI", "Roboto", "sans-serif"],
        display: ['"Bricolage Grotesque Variable"', '"Instrument Sans Variable"', "system-ui", "sans-serif"],
      },
      fontSize: {
        price: ["1.75rem", { lineHeight: "1", letterSpacing: "-0.02em", fontWeight: "800" }],
      },
    },
  },
  plugins: [],
} satisfies Config;
