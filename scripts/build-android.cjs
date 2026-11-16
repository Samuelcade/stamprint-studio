const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
if (!fs.existsSync(sdk)) throw new Error("Configura ANDROID_HOME con la ruta del SDK de Android.");
const result = spawnSync(process.platform === "win32" ? "gradlew.bat" : "./gradlew", ["assembleDebug", "--console=plain", "--no-daemon"], {
  cwd: path.join(root, "android"), stdio: "inherit", shell: process.platform === "win32",
  env: { ...process.env, ANDROID_HOME: sdk },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const { version } = require(path.join(root, "package.json"));
const target = path.join(root, "installers", `Stamprint-Studio-${version}-Android.apk`);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(path.join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"), target);
console.log(`APK generado: ${target}`);
