import { tracePixels, TraceOptions } from "./vector";
self.onmessage = async (event: MessageEvent<{ source: string; options: TraceOptions }>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    const { source, options } = event.data;
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(source)) throw new Error("Carga una imagen PNG, JPG o WebP.");
    bitmap = await createImageBitmap(await (await fetch(source)).blob());
    const maxSide = Math.max(256, Math.min(2048, Number(options.resolution) || 768));
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    const ctx = canvas.getContext("2d")!; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = tracePixels(ctx.getImageData(0, 0, canvas.width, canvas.height), options, (progress, stage) => self.postMessage({ type: "progress", progress, stage }));
    self.postMessage({ type: "done", result });
  } catch (error) { self.postMessage({ type: "error", message: error instanceof Error ? error.message : "No se pudo vectorizar la imagen." }); }
  finally { bitmap?.close(); }
};
