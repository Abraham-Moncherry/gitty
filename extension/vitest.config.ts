import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  resolve: {
    alias: {
      "~lib": path.resolve(__dirname, "src/lib"),
      "~contexts": path.resolve(__dirname, "src/contexts"),
      "~popup": path.resolve(__dirname, "src/popup"),
      "~background": path.resolve(__dirname, "src/background"),
      "~styles": path.resolve(__dirname, "src/styles"),
      "~": path.resolve(__dirname, "src")
    }
  },
  define: {
    "process.env.PLASMO_PUBLIC_SUPABASE_URL": JSON.stringify(
      "https://test-project.supabase.co"
    ),
    "process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(
      "test-anon-key"
    )
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".plasmo", "build"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/__tests__/**", "src/styles/**", "**/*.d.ts"]
    },
    css: false
  }
})
