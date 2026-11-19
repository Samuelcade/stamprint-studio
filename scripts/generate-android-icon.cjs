const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const root = path.resolve(__dirname, "..");
async function main() {
  const logo = await loadImage(fs.readFileSync(path.join(root, "assets/branding/stamprint-logo.png")));
  for (const [density, size] of [["mdpi", 48], ["hdpi", 72], ["xhdpi", 96], ["xxhdpi", 144], ["xxxhdpi", 192]]) {
    const dir = path.join(root, "android", "app", "src", "main", "res", `mipmap-${density}`);
    const draw = (pixels, inset) => {
      const canvas = createCanvas(pixels, pixels), ctx = canvas.getContext("2d");
      ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, pixels, pixels);
      ctx.drawImage(logo, inset, inset, pixels - 2 * inset, pixels - 2 * inset);
      return canvas.toBuffer("image/png");
    };
    const standard = draw(size, 0);
    fs.writeFileSync(path.join(dir, "ic_launcher.png"), standard);
    fs.writeFileSync(path.join(dir, "ic_launcher_round.png"), standard);
    const foregroundSize = size * 108 / 48;
    fs.writeFileSync(path.join(dir, "ic_launcher_foreground.png"), draw(foregroundSize, foregroundSize * .17));
  }
  console.log("Iconos Android generados a partir del logo de Stamprint.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
