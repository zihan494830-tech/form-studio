import { defineConfig } from "@playwright/test";

const testPort = Number(process.env.FORM_STUDIO_TEST_PORT || 4191);
const testBaseURL = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  webServer: {
    command: "node server.mjs --test-mode",
    url: `${testBaseURL}/fixture/exercise-1`,
    env: { FORM_STUDIO_PORT: String(testPort) },
    reuseExistingServer: false,
    timeout: 30000,
  },
  use: {
    baseURL: testBaseURL,
  },
});
