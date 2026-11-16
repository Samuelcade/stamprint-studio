import { loadImage, makeCanvas } from "../graphic-editor/render";
import { pngWithDpi } from "../graphic-editor/png";
import { vectorSvg, VectorSession } from "./vector";
/** Set the longest side to 7680 pixels while preserving the physical print size. */
export function dpiFor8K(widthCm: number, aspect: number) {
  return 7680 * 2.54 / (widthCm * Math.max(1, 1 / aspect));
}
export function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function rasterizeVector(session: VectorSession, dpi: number, forEditor = false) {
  if (!session.result) throw new Error("Primero genera el vector.");
  const width = Math.max(1, Math.round(session.widthCm / 2.54 * dpi));
  const height = Math.max(1, Math.round(session.widthCm / 2.54 * dpi * session.result.height / session.result.width));
  if (!Number.isFinite(dpi) || dpi <= 0 || dpi > 10000 || !Number.isFinite(width) || !Number.isFinite(height)) throw new Error("Medidas o DPI inválidos. Para 8K, aumenta el tamaño físico del diseño.");
  const scale = forEditor ? Math.min(1, 4096 / Math.max(width, height), Math.sqrt(12_000_000 / (width * height))) : 1;
  if (!forEditor && (width > 8192 || height > 8192 || width * height > 64_000_000)) throw new Error("El PNG supera 8192 px por lado o 64 megapíxeles. Reduce los cm o los DPI; el SVG no tiene ese límite de píxeles.");
  const size = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  // Rasterize the SVG at the requested pixel size, not its default 96-DPI intrinsic size.
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(vectorSvg(session.result, session.widthCm, session.smoothing, size))}`;
  const image = await loadImage(source), canvas = makeCanvas(size.width, size.height);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
export async function vectorPng(session: VectorSession, dpi: number) {
  const canvas = await rasterizeVector(session, dpi);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("No se pudo generar el PNG")), "image/png"));
  return new Blob([pngWithDpi(new Uint8Array(await blob.arrayBuffer()), dpi).buffer as ArrayBuffer], { type: "image/png" });
}
