import { qualityDimensions, QualitySize, sharpenImage, upscaleBicubic } from "./quality";

interface Request { source: string; mask: string; size: QualitySize; strength: number }
const report = (progress: number, stage: string) => self.postMessage({ type: "progress", progress: Math.round(progress), stage });
async function readPixels(source: string) {
  const response = await fetch(source), bitmap = await createImageBitmap(await response.blob());
  try {
    if (bitmap.width > 4096 || bitmap.height > 4096) throw new Error("La imagen supera el límite de 4096 píxeles por lado.");
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0); return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally { bitmap.close(); }
}
async function encode(image: { data: Uint8ClampedArray; width: number; height: number }) {
  const canvas = new OffscreenCanvas(image.width, image.height), ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}
self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    const { source, mask, size, strength } = event.data;
    report(2, "Leyendo imagen");
    const input = await readPixels(source), target = qualityDimensions(input.width, input.height, size);
    let result = upscaleBicubic(input, target.width, target.height, value => report(5 + value * 55, "Ampliando imagen"));
    result = sharpenImage(result, strength, value => report(60 + value * 25, "Ajustando nitidez"));
    report(86, "Preparando PNG");
    const blob = await encode(result);
    let maskBlob: Blob | undefined;
    if (mask) {
      const bitmap = await createImageBitmap(await (await fetch(mask)).blob());
      try {
        const canvas = new OffscreenCanvas(target.width, target.height), ctx = canvas.getContext("2d")!;
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(bitmap, 0, 0, target.width, target.height);
        maskBlob = await canvas.convertToBlob({ type: "image/png" });
      } finally { bitmap.close(); }
    }
    self.postMessage({ type: "done", blob, maskBlob, ...target });
  } catch (error) { self.postMessage({ type: "error", message: (error as Error).message || "No se pudo mejorar la imagen" }); }
};
