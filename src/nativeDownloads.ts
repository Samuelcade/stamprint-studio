import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

// Existing export buttons use downloadable anchors, including the 360° video.
// Android WebView needs the native file/share bridge for blob downloads.
export function setupNativeDownloads() {
  if (!Capacitor.isNativePlatform()) return;
  document.addEventListener("click", event => {
    const target = event.target;
    const anchor = target instanceof Element ? target.closest("a[download]") : null;
    if (!(anchor instanceof HTMLAnchorElement)) return;
    event.preventDefault();
    const name = (anchor.download || "stamprint-export").replace(/[^\p{L}\p{N}._-]/gu, "_");
    const source = anchor.href;
    void (async () => {
      const response = await fetch(source);
      const blob = await response.blob();
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
        reader.readAsDataURL(blob);
      });
      const result = await Filesystem.writeFile({ path: `exports/${name}`, data, directory: Directory.Cache, recursive: true });
      await Share.share({ title: name, files: [result.uri], dialogTitle: "Guardar o compartir archivo" });
    })().catch(error => {
      // Closing the Android share sheet is an ordinary cancellation.
      if (!String(error).toLowerCase().includes("cancel")) alert("No se pudo guardar el archivo. Inténtalo de nuevo.");
    });
  }, true);
}
