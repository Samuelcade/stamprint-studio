import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import packageInfo from "./package.json" with { type: "json" };
const { version, nativeBuildNumber } = packageInfo;
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";

async function appIcon(size: number): Promise<Buffer> {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  const logo = await loadImage(readFileSync(new URL("./assets/branding/stamprint-logo.png", import.meta.url)));
  context.drawImage(logo, 0, 0, size, size);
  return canvas.toBuffer("image/png");
}

export default defineConfig({
  plugins: [
    {
      name: "stamprint-app-icons",
      async generateBundle() {
        this.emitFile({ type: "asset", fileName: "build-info.json", source: JSON.stringify({ version, build: nativeBuildNumber }, null, 2) });
        for (const size of [192, 512]) {
          this.emitFile({ type: "asset", fileName: `icon-${size}.png`, source: await appIcon(size) });
        }
      },
    },
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Stamprint Studio",
        short_name: "Stamprint",
        description: "Estudio de diseño y preparación de artes textiles",
        lang: "es",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#151c27",
        theme_color: "#151c27",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{html,js,css,png,svg,glb,wasm}"],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
      },
    }),
  ],
});
