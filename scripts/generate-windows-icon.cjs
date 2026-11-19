const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

async function main() {
  const root = path.resolve(__dirname, "..");
  const image = await loadImage(fs.readFileSync(path.join(root, "assets/branding/stamprint-logo.png")));
  const canvas = createCanvas(256, 256);
  canvas.getContext("2d").drawImage(image, 0, 0, 256, 256);
  const png = canvas.toBuffer("image/png");
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  fs.mkdirSync(path.join(root, "build"), { recursive: true });
  fs.writeFileSync(path.join(root, "build", "icon.ico"), Buffer.concat([header, png]));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
