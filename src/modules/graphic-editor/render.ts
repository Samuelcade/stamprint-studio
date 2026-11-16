import type { DesignLayer, Project, RasterLayer, TextLayer } from "../../core/types";
import { enhance } from "../image-enhancement/enhance";
import { screenGeometry } from "../halftone/halftone";
import { HalftoneProcessor } from "../halftone/processor";
import { pngWithDpi } from "./png";
import { removeWhiteHalo } from "../background-removal/whiteHalo";
import { applyChrome } from "./chrome";

export function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo leer una de las imágenes")); image.src = source;
  });
}
export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; return canvas;
}
export const textFont = (layer: TextLayer, size: number) => `${layer.italic ? "italic" : "normal"} ${layer.bold ? "700" : "400"} ${size}px "${layer.fontFamily}"`;
export function measureTextLayer(layer: TextLayer, text = layer.text, family = layer.fontFamily, bold = layer.bold, italic = layer.italic): TextLayer {
  const fontSize = layer.height / (Math.max(1, layer.text.split("\n").length) * 1.25);
  const ctx = makeCanvas(1, 1).getContext("2d")!;
  ctx.font = textFont({ ...layer, fontFamily: family, bold, italic }, fontSize);
  const width = Math.max(fontSize * .3, ...text.split("\n").map(line => ctx.measureText(line).width));
  return { ...layer, text, fontFamily: family, bold, italic, width: width + fontSize * .15, height: Math.max(1, text.split("\n").length) * fontSize * 1.25 };
}

function drawText(ctx: CanvasRenderingContext2D, layer: TextLayer) {
  const lines = layer.text.split("\n"), lineHeight = layer.height / lines.length, fontSize = lineHeight / 1.25;
  ctx.font = textFont(layer, fontSize); ctx.fillStyle = layer.color; ctx.textBaseline = "middle";
  const measuredWidth = Math.max(fontSize * .3, ...lines.map(line => ctx.measureText(line).width)) + fontSize * .15;
  ctx.scale(layer.width / measuredWidth, 1); ctx.textAlign = layer.align;
  const x = layer.align === "left" ? -measuredWidth / 2 + fontSize * .075 : layer.align === "right" ? measuredWidth / 2 - fontSize * .075 : 0;
  lines.forEach((line, i) => ctx.fillText(line, x, -layer.height / 2 + lineHeight * (i + .5)));
}

async function prepareImage(layer: RasterLayer, maxSide: number, dpi: number, processor: HalftoneProcessor, isCurrent: () => boolean) {
  const scale = Math.min(1, maxSide / Math.max(layer.pixelWidth, layer.pixelHeight));
  const screen = layer.effects.halftone ? screenGeometry(layer, dpi) : undefined;
  const width = screen?.width ?? Math.max(1, Math.round(layer.pixelWidth * scale)), height = screen?.height ?? Math.max(1, Math.round(layer.pixelHeight * scale));
  const [image, mask] = await Promise.all([loadImage(layer.source), layer.mask ? loadImage(layer.mask) : undefined]);
  if (!isCurrent()) throw new Error("Preparación reemplazada por una edición más reciente.");
  const canvas = makeCanvas(width, height), ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0, width, height);
  if (layer.effects.brightness || layer.effects.contrast || layer.effects.saturation) ctx.putImageData(enhance(ctx.getImageData(0, 0, width, height), layer.effects), 0, 0);
  if (mask) { ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(mask, 0, 0, width, height); ctx.globalCompositeOperation = "source-over"; }
  if (layer.effects.whiteHalo) {
    const pixels = ctx.getImageData(0, 0, width, height);
    pixels.data.set(removeWhiteHalo(pixels, layer.effects.whiteHalo)); ctx.putImageData(pixels, 0, 0);
  }
  if (layer.effects.chrome) applyChrome(canvas, layer.effects.chrome, layer.effects);
  if (screen) ctx.putImageData(await processor.run(layer.id, ctx.getImageData(0, 0, width, height), screen.settings), 0, 0);
  if (layer.effects.whiteUnderbase) {
    const base = makeCanvas(width, height), baseCtx = base.getContext("2d")!;
    baseCtx.drawImage(canvas, 0, 0); baseCtx.globalCompositeOperation = "source-in";
    baseCtx.fillStyle = "white"; baseCtx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "destination-over"; ctx.drawImage(base, 0, 0); ctx.globalCompositeOperation = "source-over";
  }
  return canvas;
}

export class ProjectRenderer {
  private halftone = new HalftoneProcessor();
  private cache = new Map<string, { source: string; mask: string; effects: string; maxSide: number; promise: Promise<HTMLCanvasElement> }>();
  async prepare(project: Project, highQuality = false, fullResolution = false) {
    const ids = new Set(project.layers.map(layer => layer.id));
    for (const id of this.cache.keys()) if (!ids.has(id)) { this.halftone.cancel(id); this.cache.delete(id); }
    const requestedSide = highQuality ? 4096 : 1400;
    const entries = await Promise.all(project.layers.filter(layer => layer.visible && layer.kind === "image").map(async item => {
      const layer = item as RasterLayer;
      const maxSide = layer.effects.halftone ? 4096 : fullResolution ? Math.max(layer.pixelWidth, layer.pixelHeight) : requestedSide;
      const effects = JSON.stringify({ ...layer.effects, mirror: false, screen: layer.effects.halftone ? [layer.width, layer.height, project.dpi, layer.pixelWidth, layer.pixelHeight] : undefined });
      let cached = this.cache.get(layer.id);
      if (!cached || cached.source !== layer.source || cached.mask !== layer.mask || cached.effects !== effects || cached.maxSide !== maxSide) {
        this.halftone.cancel(layer.id);
        cached = { source: layer.source, mask: layer.mask, effects, maxSide, promise: prepareImage(layer, maxSide, project.dpi, this.halftone, () => this.cache.get(layer.id) === cached) };
        this.cache.set(layer.id, cached);
        cached.promise.catch(() => { if (this.cache.get(layer.id) === cached) this.cache.delete(layer.id); });
      }
      return [layer.id, await cached.promise] as const;
    }));
    return new Map(entries);
  }

  paint(project: Project, canvas: HTMLCanvasElement, prepared: Map<string, HTMLCanvasElement>, maxSide = 1400) {
    const scale = Math.min(1, maxSide / Math.max(project.width, project.height));
    const width = Math.max(1, Math.round(project.width * scale)), height = Math.max(1, Math.round(project.height * scale));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, width, height); ctx.save(); ctx.scale(width / project.width, height / project.height);
    for (const layer of project.layers) {
      if (!layer.visible || layer.opacity === 0) continue;
      ctx.save(); ctx.translate(layer.x, layer.y); ctx.rotate(layer.rotation * Math.PI / 180);
      if (layer.effects.mirror) ctx.scale(-1, 1);
      ctx.globalAlpha = layer.opacity;
      if (layer.kind === "image") {
        const image = prepared.get(layer.id);
        if (image) ctx.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
      } else if (layer.effects.chrome) {
        const rasterScale = Math.min(width / project.width, height / project.height, 4096 / Math.max(layer.width, layer.height));
        const text = makeCanvas(Math.max(1, Math.round(layer.width * rasterScale)), Math.max(1, Math.round(layer.height * rasterScale))), textCtx = text.getContext("2d")!;
        textCtx.translate(text.width / 2, text.height / 2); textCtx.scale(text.width / layer.width, text.height / layer.height);
        drawText(textCtx, layer); applyChrome(text, layer.effects.chrome, layer.effects);
        ctx.drawImage(text, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
      } else drawText(ctx, layer);
      ctx.restore();
    }
    ctx.restore();
  }

  async render(project: Project, maxSide: number, highQuality = false) {
    const prepared = await this.prepare(project, highQuality, maxSide === Infinity), canvas = makeCanvas(1, 1);
    this.paint(project, canvas, prepared, maxSide); return canvas;
  }
  async exportPng(project: Project) {
    const canvas = await this.render(project, Infinity, true);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("No se pudo crear el PNG")), "image/png"));
    return new Blob([pngWithDpi(new Uint8Array(await blob.arrayBuffer()), project.dpi).buffer as ArrayBuffer], { type: "image/png" });
  }
}

export async function importImageFile(file: File) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Elige una imagen PNG, JPG o WebP");
  const source = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("No se pudo abrir la imagen")); reader.readAsDataURL(file); });
  const image = await loadImage(source);
  const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight), Math.sqrt(12_000_000 / (image.naturalWidth * image.naturalHeight)));
  const width = Math.max(1, Math.round(image.naturalWidth * scale)), height = Math.max(1, Math.round(image.naturalHeight * scale));
  if (scale === 1) return { source, width, height };
  const canvas = makeCanvas(width, height); canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
  return { source: canvas.toDataURL("image/png"), width, height };
}

export function replaceLayer(project: Project, layer: DesignLayer): Project {
  return { ...project, layers: project.layers.map(item => item.id === layer.id ? layer : item) };
}
