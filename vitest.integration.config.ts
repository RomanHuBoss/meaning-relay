// Эта конфигурация задаёт отдельный запуск проверок, которым требуется настоящая база данных.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
  },
});
