const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const root = path.resolve(__dirname, "..");
const { version } = require(path.join(root, "package.json"));
async function main() {
  const zip = new JSZip();
  const ignored = new Set(["node_modules", "build", "DerivedData", "xcuserdata", ".DS_Store", ".git"]);
  function add(relative) {
    const file = path.join(root, relative), stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`No se incluyen enlaces simbólicos: ${relative}`);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(file)) if (!ignored.has(entry)) add(path.posix.join(relative, entry));
    } else zip.file(relative, fs.readFileSync(file));
  }
  // Explicit source list: no credentials, signing keys, build caches or installed dependencies.
  const entries = [".github/workflows/installers.yml", "src", "electron", "ios", "scripts", "dist", "docs", "assets", "package.json", "package-lock.json", "capacitor.config.ts", "vite.config.ts", "vitest.config.ts", "tsconfig.json", "tsconfig.app.json", "index.html", "README.md"];
  for (const entry of entries) add(entry);
  zip.file("LEEME-APPLE.md", fs.readFileSync(path.join(root, "docs/APPLE.md")));
  const file = path.join(root, "installers", `Stamprint-Studio-${version}-Apple-Proyecto.zip`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }));
  const verified = await JSZip.loadAsync(fs.readFileSync(file));
  for (const required of [".github/workflows/installers.yml", "package-lock.json", "ios/App/App.xcodeproj/project.pbxproj", "dist/index.html", "src/App.tsx", "electron/main.cjs", "LEEME-APPLE.md"]) {
    if (!verified.file(required)) throw new Error(`Falta un archivo en el paquete: ${required}`);
  }
  console.log(`Proyecto Apple preparado (no es DMG ni IPA): ${file}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
