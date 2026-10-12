import type { Config } from "tailwindcss";

/**
 * Visual identity: a market stall. Forest-green ink on warm paper, the amber
 * tag carries the price, coral marks the advertised discount and green only
 * what our own price history proves.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#12322A", soft: "#3F5A51", mute: "#74867F" },
        paper: { DEFAULT: "#F6F3EC", card: "#FFFFFF", line: "#E5E0D3" },
        tag: { DEFAULT: "#FFB627", deep: "#E39A0B", soft: "#FFF1D1" },
        promo: { DEFAULT: "#E4452B", soft: "#FCE7E2" },
        proof: { DEFAULT: "#1C8A57", soft: "#E1F3E9" },
        forest: { DEFAULT: "#0B2B24", light: "#12392F", line: "#1F4A3E" },
        brand: { 50: "#EDF3F0", 100: "#DCE7E2", 500: "#3F5A51", 600: "#12322A", 700: "#0B2B24", 900: "#071D18" },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', "system-ui", "Segoe UI", "Roboto", "sans-serif"],
        display: ['"Fraunces Variable"', "Georgia", "serif"],
      },
      fontSize: {
        price: ["1.75rem", { lineHeight: "1", letterSpacing: "-0.02em", fontWeight: "800" }],
      },
    },
  },
  plugins: [],
} satisfies Config;
