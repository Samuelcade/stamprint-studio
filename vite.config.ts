import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import packageInfo from "./package.json" with { type: "json" };
const { version, nativeBuildNumber } = packageInfo;
import { createCanvas } from "@napi-rs/canvas";

function appIcon(size: number): Buffer {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  context.fillStyle = "#151c27";
  context.fillRect(0, 0, size, size);
  context.fillStyle = "#ffffff";
  context.font = `bold ${Math.round(size * 0.36)}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("S", size / 2, size / 2);
  return canvas.toBuffer("image/png");
}

export default defineConfig({
  plugins: [
    {
      name: "stamprint-app-icons",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "build-info.json", source: JSON.stringify({ version, build: nativeBuildNumber }, null, 2) });
        for (const size of [192, 512]) {
          this.emitFile({ type: "asset", fileName: `icon-${size}.png`, source: appIcon(size) });
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
