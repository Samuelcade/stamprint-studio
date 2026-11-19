const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

async function main() {
  const root = path.resolve(__dirname, "..");
  const image = await loadImage(fs.readFileSync(path.join(root, "assets/branding/stamprint-logo.png")));
  const canvas = createCanvas(1024, 1024);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.drawImage(image, 0, 0, 1024, 1024);
  const png = canvas.toBuffer("image/png");
  fs.writeFileSync(path.join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"), png);
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  fs.writeFileSync(path.join(root, "assets/apple-icon.png"), png);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
