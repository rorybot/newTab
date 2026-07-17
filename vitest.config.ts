import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
    setupFiles: ["./tests/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/lib/**/*.ts",
        "src/settings/store.ts",
        "src/config/features.ts",
        "src/ui/background.ts",
        "src/features/hn/**/*.ts",
        "src/features/spotify/api.ts",
        "src/features/spotify/auth.ts",
      ],
      thresholds: { lines: 65, functions: 65, statements: 65, branches: 55 },
    },
  },
});
