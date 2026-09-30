import { defineConfig } from "@playwright/test";

// Runs the real web app and game server against the Firebase emulators
// (Firestore + Auth, project "demo-snake-ladder" — never the real project).
// Needs Java for the Firestore emulator. See README.md → "End-to-end tests".
const emulatorEnv = {
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_PROJECT_ID: "demo-snake-ladder",
};

export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    // Optional: a locally installed Chromium instead of `npx playwright install chromium`
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: "npx -y firebase-tools@14 emulators:start --only firestore,auth --project demo-snake-ladder",
      cwd: "..",
      url: "http://127.0.0.1:9099/",
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: "node server.js",
      cwd: "../server",
      url: "http://127.0.0.1:10000/",
      env: { ...emulatorEnv, PORT: "10000" },
      reuseExistingServer: true,
    },
    {
      command: "npm run dev -- --port 5173 --host 127.0.0.1 --strictPort",
      cwd: "../web",
      url: "http://127.0.0.1:5173/",
      env: { VITE_FIREBASE_EMULATORS: "1", VITE_SERVER_URL: "http://127.0.0.1:10000" },
      reuseExistingServer: true,
    },
  ],
});
