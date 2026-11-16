const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const { version } = require(path.join(root, "package.json"));
const target = process.argv[2];
if (!["mac", "ios-simulator", "ios-archive"].includes(target)) throw new Error("Destino esperado: mac, ios-simulator o ios-archive.");
if (process.platform !== "darwin") {
  console.error("La compilación Apple necesita macOS y Xcode. En este equipo usa npm run package:apple para preparar el proyecto transferible.");
  process.exit(1);
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run("xcodebuild", ["-version"]);
if (target === "ios-archive" && !/^[A-Z0-9]{10}$/.test(process.env.APPLE_TEAM_ID || "")) {
  throw new Error("Configura APPLE_TEAM_ID con tu equipo de Apple y la firma en Xcode antes de crear el archivo para iPhone.");
}
run("npm", ["run", "build"]);
if (target === "mac") {
  run("npx", ["electron-builder", "--mac", "dmg", "zip", "--x64", "--arm64", "--publish", "never", "--config.directories.output=installers/mac"]);
} else {
  run("npx", ["cap", "sync", "ios"]);
  const common = ["-project", "ios/App/App.xcodeproj", "-scheme", "App", "-configuration", "Release"];
  const destination = path.join(root, "installers", "ios"); fs.mkdirSync(destination, { recursive: true });
  if (target === "ios-simulator") {
    const derived = path.join(destination, "simulator-build");
    run("xcodebuild", [...common, "-destination", "generic/platform=iOS Simulator", "-derivedDataPath", derived, "CODE_SIGNING_ALLOWED=NO", "build"]);
    run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", path.join(derived, "Build/Products/Release-iphonesimulator/App.app"), path.join(destination, `Stamprint-Studio-${version}-iOS-Simulator.zip`)]);
  } else {
    run("xcodebuild", [...common, "-destination", "generic/platform=iOS", "-archivePath", path.join(destination, `Stamprint-Studio-${version}.xcarchive`), `DEVELOPMENT_TEAM=${process.env.APPLE_TEAM_ID}`, "CODE_SIGN_STYLE=Automatic", "archive"]);
    console.log("Abre el .xcarchive en Xcode Organizer para validar y exportar con el perfil de distribución de tu cuenta.");
  }
}
