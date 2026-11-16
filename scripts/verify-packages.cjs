const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const JSZip = require("jszip");
const asar = require("@electron/asar");
const root = path.resolve(__dirname, "..");
const { version, nativeBuildNumber } = require(path.join(root, "package.json"));
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function files(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(path.join(directory, entry.name), prefix + entry.name + "/")
    : [{ name: prefix + entry.name, bytes: fs.readFileSync(path.join(directory, entry.name)) }]);
}
async function main() {
  const definitions = [
    { platform: "Android", file: `Stamprint-Studio-${version}-Android.apk`, prefix: "assets/public/", status: "APK de desarrollo firmado; no publicado" },
    { platform: "Web", file: `Stamprint-Studio-${version}-Web.zip`, prefix: "", status: "Recursos para alojar en HTTPS" },
    { platform: "macOS/iOS", file: `Stamprint-Studio-${version}-Apple-Proyecto.zip`, prefix: "dist/", status: "Proyecto fuente preparado; pendiente compilar en macOS y firmar para dispositivo" },
  ];
  const report = { version, nativeBuildNumber, resources: 0, artifacts: [] };
  const distribution = files(path.join(root, "dist")); report.resources = distribution.length;
  const info = JSON.parse(distribution.find(entry => entry.name === "build-info.json").bytes);
  if (info.version !== version || info.build !== nativeBuildNumber) throw new Error("dist pertenece a otra compilación.");
  for (const definition of definitions) {
    const absolute = path.join(root, "installers", definition.file), bytes = fs.readFileSync(absolute), zip = await JSZip.loadAsync(bytes);
    for (const entry of distribution) {
      const packaged = zip.file(definition.prefix + entry.name);
      if (!packaged || hash(await packaged.async("nodebuffer")) !== hash(entry.bytes)) throw new Error(`Recurso distinto o ausente en ${definition.platform}: ${entry.name}`);
    }
    if (definition.platform === "macOS/iOS") {
      const metadata = JSON.parse(await zip.file("package.json").async("string"));
      const project = await zip.file("ios/App/App.xcodeproj/project.pbxproj").async("string");
      if (metadata.version !== version || !project.includes(`MARKETING_VERSION = ${version};`) || !project.includes(`CURRENT_PROJECT_VERSION = ${nativeBuildNumber};`)) throw new Error("Versión Apple inconsistente.");
      for (const entry of distribution) if (hash(await zip.file("ios/App/App/public/" + entry.name).async("nodebuffer")) !== hash(entry.bytes)) throw new Error("Recursos iOS desactualizados.");
    }
    report.artifacts.push({ platform: definition.platform, file: definition.file, bytes: bytes.length, sha256: hash(bytes), status: definition.status });
  }
  const windows = `windows-${version}/Stamprint-Studio-${version}-Windows.exe`;
  const windowsBytes = fs.readFileSync(path.join(root, "installers", windows));
  const archive = path.join(root, "installers", `windows-${version}/win-unpacked/resources/app.asar`);
  const metadata = JSON.parse(asar.extractFile(archive, "package.json").toString());
  if (metadata.version !== version) throw new Error("Windows pertenece a otra versión.");
  for (const entry of distribution) if (hash(asar.extractFile(archive, path.join("dist", ...entry.name.split("/")))) !== hash(entry.bytes)) throw new Error(`Recursos Windows desactualizados: ${entry.name}`);
  report.artifacts.push({ platform: "Windows x64", file: windows, bytes: windowsBytes.length, sha256: hash(windowsBytes), status: "Instalador NSIS sin firma de editor" });
  const output = path.join(root, "installers", `Stamprint-Studio-${version}-manifest.json`);
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`Verificados ${distribution.length} recursos idénticos en APK, Windows, web y proyecto Apple.\n${output}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
