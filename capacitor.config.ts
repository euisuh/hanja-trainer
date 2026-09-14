import type { CapacitorConfig } from "@capacitor/cli";

// Loads the bundled SPA from dist/client. Never set server.url here: that would
// ship a wrapper around the live website instead of the built app.
const config: CapacitorConfig = {
  appId: "com.uiseoya.hanja",
  appName: "漢字 Trainer",
  webDir: "dist/client",
};

export default config;
