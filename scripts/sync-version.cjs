const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const { version, nativeBuildNumber } = require(path.join(root, "package.json"));
if (!/^\d+\.\d+\.\d+$/.test(version) || !Number.isSafeInteger(nativeBuildNumber) || nativeBuildNumber < 1) {
  throw new Error("Define version (x.y.z) y nativeBuildNumber entero positivo en package.json.");
}
const targets = [
  ["android/app/build.gradle", [[/versionCode \d+/g, `versionCode ${nativeBuildNumber}`], [/versionName "[^"]+"/g, `versionName "${version}"`]]],
  ["ios/App/App.xcodeproj/project.pbxproj", [[/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${nativeBuildNumber};`], [/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`]]],
];
for (const [relative, replacements] of targets) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  const original = fs.readFileSync(file, "utf8"); let next = original;
  for (const [pattern, value] of replacements) {
    if (!next.match(pattern)) throw new Error(`No se encontró el campo de versión: ${relative}`);
    next = next.replace(pattern, value);
  }
  if (next !== original) fs.writeFileSync(file, next);
}
console.log(`Versión nativa sincronizada: ${version} (${nativeBuildNumber}).`);
