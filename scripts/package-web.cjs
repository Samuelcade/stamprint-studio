const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const root = path.resolve(__dirname, "..");
const { version } = require(path.join(root, "package.json"));

async function main() {
  const zip = new JSZip();
  function add(directory, prefix = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name), name = prefix + entry.name;
      if (entry.isDirectory()) add(file, name + "/");
      else zip.file(name, fs.readFileSync(file));
    }
  }
  add(path.join(root, "dist"));
  const target = path.join(root, "installers", `Stamprint-Studio-${version}-Web.zip`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(`Web instalable para iOS, Android, Windows y macOS: ${target}`);
  console.log("Publica el contenido en HTTPS para instalarlo desde el navegador. El ZIP no es un instalador nativo.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
