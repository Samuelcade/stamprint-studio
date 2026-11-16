import { colorHex } from "./model";
import type { Poster, PosterLayer } from "./model";
import { photoTemplate } from "./catalog";
import type { PhotoTemplate } from "./catalog";

export function photoPlacement(iw: number, ih: number, width: number, height: number, fit: "contain" | "cover" = "cover", crop?: PhotoTemplate["crop"]) {
  const source = crop ?? { x: 0, y: 0, width: iw, height: ih };
  const scale = (fit === "contain" ? Math.min : Math.max)(width / source.width, height / source.height);
  return { source, x: (width - source.width * scale) / 2, y: (height - source.height * scale) / 2, width: source.width * scale, height: source.height * scale, scale };
}
export function drawPhoto(ctx: CanvasRenderingContext2D, image: CanvasImageSource, iw: number, ih: number, width: number, height: number, fit: "contain" | "cover" = "cover", crop?: PhotoTemplate["crop"]) {
  const p = photoPlacement(iw, ih, width, height, fit, crop);
  ctx.drawImage(image, p.source.x, p.source.y, p.source.width, p.source.height, p.x, p.y, p.width, p.height);
}
export function templateMask(template: PhotoTemplate, photo: HTMLImageElement, width: number, height: number, fit: "contain" | "cover") {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const ctx = canvas.getContext("2d")!;
  const p = photoPlacement(template.width, template.height, width, height, fit, template.crop);
  if (template.lightOnDark) {
    drawPhoto(ctx, photo, template.width, template.height, width, height, fit, template.crop);
    const pixels = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const light = Math.min(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]);
      pixels.data[i + 3] *= Math.max(0, Math.min(1, (light - 40) / 100));
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
  } else if (template.maskPath) {
    ctx.save(); ctx.beginPath(); ctx.rect(p.x, p.y, p.width, p.height); ctx.clip();
    ctx.translate(p.x, p.y); ctx.scale(p.scale, p.scale); ctx.translate(-p.source.x, -p.source.y);
    ctx.fillStyle = "white"; ctx.fill(new Path2D(template.maskPath)); ctx.restore();
  }
  return canvas;
}
/** Apply a tint only through the selected photographic mask, retaining highlights. */
export function tintPixels(photo: Uint8ClampedArray, mask: Uint8ClampedArray, color: string) {
  if (!colorHex(color) || photo.length !== mask.length) throw new Error("No se pudo cambiar el color de la prenda.");
  const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  const histogram = new Float64Array(256); let count = 0;
  for (let i = 0; i < photo.length; i += 4) if (mask[i + 3] > 200) { histogram[Math.round(photo[i] * .2126 + photo[i + 1] * .7152 + photo[i + 2] * .0722)]++; count++; }
  let median = 230, sum = 0;
  for (let i = 0; i < histogram.length; i++) { sum += histogram[i]; if (count && sum >= count / 2) { median = i; break; } }
  for (let i = 0; i < photo.length; i += 4) {
    const a = mask[i + 3] / 255; if (!a) continue;
    const light = (photo[i] * .2126 + photo[i + 1] * .7152 + photo[i + 2] * .0722) / 255;
    const shade = Math.min(1.12, light / Math.max(.08, median / 255) * .9);
    const highlight = Math.max(0, shade - .72) * 24;
    for (let c = 0; c < 3; c++) photo[i + c] = photo[i + c] * (1 - a) + (rgb[c] * shade + highlight) * a;
  }
}

/** Render the same background used in preview and export. */
export function drawPosterBackground(ctx: CanvasRenderingContext2D, width: number, height: number, poster: Poster, photo?: HTMLImageElement, mask?: HTMLCanvasElement, backgroundImage?: HTMLImageElement, backgroundMask?: HTMLImageElement) {
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = poster.background; ctx.fillRect(0, 0, width, height);
  if (backgroundImage) drawPhoto(ctx, backgroundImage, backgroundImage.naturalWidth, backgroundImage.naturalHeight, width, height);
  const template = photoTemplate(poster.template);
  if (poster.template === "photo" || template) {
    if (!photo) return;
    const foreground = document.createElement("canvas"); foreground.width = width; foreground.height = height;
    const foregroundCtx = foreground.getContext("2d", { willReadFrequently: true }); if (!foregroundCtx) throw new Error("No se pudo preparar la prenda.");
    drawPhoto(foregroundCtx, photo, photo.naturalWidth, photo.naturalHeight, width, height, poster.photoFit ?? "cover", template?.crop);
    if (backgroundMask) {
      foregroundCtx.globalCompositeOperation = "destination-out";
      const ratio = backgroundMask.naturalWidth / photo.naturalWidth;
      const crop = template?.crop ? { x: template.crop.x * ratio, y: template.crop.y * ratio, width: template.crop.width * ratio, height: template.crop.height * ratio } : undefined;
      drawPhoto(foregroundCtx, backgroundMask, backgroundMask.naturalWidth, backgroundMask.naturalHeight, width, height, poster.photoFit ?? "cover", crop);
      foregroundCtx.globalCompositeOperation = "source-over";
    }
    // A prepared garment has a complete silhouette. A later color click must not
    // replace it with a patchy, color-threshold selection of its highlights.
    const selectedMask = template && poster.recolor !== false ? templateMask(template, photo, width, height, poster.photoFit ?? "contain") : poster.cutout ? foreground : mask;
    if (selectedMask && poster.recolor !== false) {
      const maskCanvas = document.createElement("canvas"); maskCanvas.width = width; maskCanvas.height = height; const maskCtx = maskCanvas.getContext("2d");
      if (!maskCtx) throw new Error("No se pudo preparar el color de la prenda.");
      maskCtx.drawImage(selectedMask, 0, 0, width, height);
      const image = foregroundCtx.getImageData(0, 0, width, height); tintPixels(image.data, maskCtx.getImageData(0, 0, width, height).data, poster.garmentColor); foregroundCtx.putImageData(image, 0, 0);
    }
    ctx.drawImage(foreground, 0, 0);
    return;
  }
  ctx.save();
  const scale = Math.min(width / 600, height / 700) * .88;
  ctx.translate((width - 600 * scale) / 2, (height - 700 * scale) / 2); ctx.scale(scale, scale);
  ctx.shadowColor = "#0006"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 12;
  ctx.beginPath(); ctx.moveTo(190, 145); ctx.lineTo(118, 180); ctx.lineTo(52, 330); ctx.lineTo(165, 374); ctx.lineTo(200, 300); ctx.lineTo(206, 585); ctx.quadraticCurveTo(300, 605, 394, 585); ctx.lineTo(400, 300); ctx.lineTo(435, 374); ctx.lineTo(548, 330); ctx.lineTo(482, 180); ctx.lineTo(410, 145); ctx.quadraticCurveTo(300, 205, 190, 145); ctx.closePath();
  ctx.fillStyle = poster.garmentColor; ctx.fill(); ctx.shadowColor = "transparent"; ctx.strokeStyle = "#0004"; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(238, 150); ctx.quadraticCurveTo(300, 220, 362, 150); ctx.strokeStyle = "#0004"; ctx.lineWidth = 8; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(205, 300); ctx.lineTo(211, 575); ctx.moveTo(395, 300); ctx.lineTo(389, 575); ctx.strokeStyle = "#0002"; ctx.lineWidth = 4; ctx.stroke();
  if (poster.template === "hoodie") {
    ctx.beginPath(); ctx.moveTo(240, 151); ctx.quadraticCurveTo(240, 72, 300, 68); ctx.quadraticCurveTo(360, 72, 360, 151); ctx.strokeStyle = "#0006"; ctx.lineWidth = 7; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(242, 438); ctx.lineTo(230, 520); ctx.quadraticCurveTo(300, 540, 370, 520); ctx.lineTo(358, 438); ctx.closePath(); ctx.strokeStyle = "#0004"; ctx.lineWidth = 3; ctx.stroke();
  }
  if (poster.template === "shirt-back") { ctx.beginPath(); ctx.moveTo(250, 155); ctx.quadraticCurveTo(300, 180, 350, 155); ctx.strokeStyle = "#0003"; ctx.lineWidth = 4; ctx.stroke(); }
  ctx.restore();
}

export function drawPosterLayer(ctx: CanvasRenderingContext2D, width: number, height: number, layer: PosterLayer, image?: CanvasImageSource) {
  ctx.save(); ctx.translate(layer.x * width, layer.y * height); ctx.rotate(layer.rotation * Math.PI / 180);
  if (layer.kind === "image" && image) {
    const w = layer.width * width, h = w / layer.aspect;
    ctx.globalAlpha = layer.opacity ?? 1;
    if (layer.technique === "sublimation") ctx.globalCompositeOperation = "multiply";
    if (layer.technique === "screen") ctx.globalAlpha *= .96;
    if (layer.technique === "vinyl" || layer.technique === "embroidery" || layer.technique === "rhinestones") { ctx.shadowColor = "#0005"; ctx.shadowBlur = width * .0015; ctx.shadowOffsetY = width * .001; }
    ctx.drawImage(image, -w / 2, -h / 2, w, h);
  }
  if (layer.kind === "text") {
    const size = layer.size * width, lines = layer.text.split("\n");
    ctx.fillStyle = layer.color; ctx.font = `${layer.bold === false ? 400 : 700} ${size}px ${layer.font ?? "Arial"}, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * size * 1.15));
  }
  ctx.restore();
}

/** Small deterministic visual finishes; originals stay intact and are still downloadable elsewhere. */
export function preparePosterPrint(image: HTMLImageElement, technique: string = "dtf"): CanvasImageSource {
  if (technique !== "embroidery" && technique !== "rhinestones") return image;
  const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (technique === "embroidery") {
    ctx.globalCompositeOperation = "source-atop"; ctx.lineWidth = 1;
    for (let x = -canvas.height; x < canvas.width; x += 4) {
      ctx.strokeStyle = "#ffffff55"; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + canvas.height, canvas.height); ctx.stroke();
      ctx.strokeStyle = "#00000033"; ctx.beginPath(); ctx.moveTo(x + 1.5, 0); ctx.lineTo(x + canvas.height + 1.5, canvas.height); ctx.stroke();
    }
  } else {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data; ctx.clearRect(0, 0, canvas.width, canvas.height);
    const step = Math.max(4, Math.round(Math.max(canvas.width, canvas.height) / 90));
    for (let y = step / 2; y < canvas.height; y += step) for (let x = step / 2; x < canvas.width; x += step) {
      const i = (Math.floor(y) * canvas.width + Math.floor(x)) * 4; if (data[i + 3] < 32) continue;
      ctx.globalAlpha = data[i + 3] / 255; ctx.fillStyle = `rgb(${data[i]} ${data[i + 1]} ${data[i + 2]})`; ctx.beginPath(); ctx.arc(x, y, step * .41, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffffffaa"; ctx.beginPath(); ctx.arc(x - step * .12, y - step * .12, step * .12, 0, Math.PI * 2); ctx.fill();
    }
  }
  return canvas;
}
