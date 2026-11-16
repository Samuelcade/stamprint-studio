import { separatePixels } from "./separate";
self.onmessage = async (event: MessageEvent<{ source: string; colors: number; removeWhite: boolean }>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    const { source, colors, removeWhite } = event.data;
    bitmap = await createImageBitmap(await (await fetch(source)).blob());
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    const context = canvas.getContext("2d"); if (!context) throw new Error("No se pudo preparar la imagen.");
    context.imageSmoothingQuality = "high"; context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = separatePixels(canvas.width, canvas.height, context.getImageData(0, 0, canvas.width, canvas.height).data, colors, removeWhite);
    self.postMessage({ type: "done", result }, { transfer: [result.labels.buffer, result.alpha.buffer] });
  } catch (error) { self.postMessage({ type: "error", message: error instanceof Error ? error.message : "No se pudo separar la imagen." }); }
  finally { bitmap?.close(); }
};
