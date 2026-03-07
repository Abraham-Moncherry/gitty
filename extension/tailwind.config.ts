import type { Config } from "tailwindcss"

export default {
  content: ["./src/**/*.{tsx,ts}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Manrope",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif"
        ]
      },
      colors: {
        primary: "#ff66c4",
        accent: "#14B8A6",
        slate: {
          DEFAULT: "#1F2937",
          light: "#6B7280",
          border: "#E5E7EB",
          text: "#111827"
        },
        surface: "#FAFAFA"
      }
    }
  },
  plugins: []
} satisfies Config
