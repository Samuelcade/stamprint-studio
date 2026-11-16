/** Detect only a uniform, border-connected background. Complex photos need a contour. */
export function uniformBackground(image: { width: number; height: number; data: Uint8ClampedArray }): Uint8ClampedArray | undefined {
  const { width, height, data } = image, count = width * height;
  const border: number[] = [];
  for (let x = 0; x < width; x++) { border.push(x); if (height > 1) border.push((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { border.push(y * width); if (width > 1) border.push(y * width + width - 1); }
  // Existing alpha is already a precise cutout; do not select any color inside it.
  if (border.filter(p => data[p * 4 + 3] < 16).length > border.length * .6) return new Uint8ClampedArray(count);
  const bins = new Map<string, number[]>();
  for (const p of border) {
    const i = p * 4, key = [data[i] >> 5, data[i + 1] >> 5, data[i + 2] >> 5].join(",");
    const bin = bins.get(key) ?? [0, 0, 0, 0];
    bin[0]++; for (let c = 0; c < 3; c++) bin[c + 1] += data[i + c]; bins.set(key, bin);
  }
  const dominant = [...bins.values()].sort((a, b) => b[0] - a[0])[0];
  if (!dominant) return;
  const color = dominant.slice(1).map(v => v / dominant[0]);
  const colorDistance = (p: number) => Math.hypot(data[p * 4] - color[0], data[p * 4 + 1] - color[1], data[p * 4 + 2] - color[2]);
  // Tight matching avoids eating pale fabric and folds on a near-white background.
  const matches = (p: number) => colorDistance(p) <= 12;
  if (border.filter(matches).length < border.length * .65) return;
  const removed = new Uint8ClampedArray(count), seen = new Uint8Array(count), queue = new Int32Array(count);
  let tail = 0;
  const enqueue = (p: number) => { if (!seen[p]) { seen[p] = 1; if (matches(p)) queue[tail++] = p; } };
  for (const p of border) enqueue(p);
  for (let head = 0; head < tail; head++) {
    const p = queue[head], x = p % width, y = Math.floor(p / width); removed[p] = 255;
    if (x) enqueue(p - 1); if (x + 1 < width) enqueue(p + 1);
    if (y) enqueue(p - width); if (y + 1 < height) enqueue(p + width);
  }
  if (tail > count * .95 || tail < count * .02) return;
  // A product cutout should form one coherent garment, not disconnected seams.
  // Reject ambiguous results instead of permanently removing the body of the fabric.
  const foregroundCount = count - tail;
  seen.fill(0);
  let largest = 0, largestStart = -1;
  for (let start = 0; start < count; start++) {
    if (removed[start] || seen[start]) continue;
    let end = 1; queue[0] = start; seen[start] = 1;
    for (let head = 0; head < end; head++) {
      const p = queue[head], x = p % width, y = Math.floor(p / width);
      const visit = (q: number) => { if (!seen[q] && !removed[q]) { seen[q] = 1; queue[end++] = q; } };
      if (x) visit(p - 1); if (x + 1 < width) visit(p + 1);
      if (y) visit(p - width); if (y + 1 < height) visit(p + width);
    }
    if (end > largest) { largest = end; largestStart = start; }
  }
  if (largest < foregroundCount * .8 || largest < count * .03) return;
  // Inspect the dominant piece before accepting a low-contrast automatic cutout.
  seen.fill(0); queue[0] = largestStart; seen[largestStart] = 1;
  let end = 1, lowContrast = 0;
  for (let head = 0; head < end; head++) {
    const p = queue[head], x = p % width, y = Math.floor(p / width);
    if (colorDistance(p) < 40) lowContrast++;
    const visit = (q: number) => { if (!seen[q] && !removed[q]) { seen[q] = 1; queue[end++] = q; } };
    if (x) visit(p - 1); if (x + 1 < width) visit(p + 1);
    if (y) visit(p - width); if (y + 1 < height) visit(p + width);
  }
  if (lowContrast > largest * .5) return;
  // Discard isolated background speckles, leaving a continuous product silhouette.
  for (let p = 0; p < count; p++) if (!seen[p]) removed[p] = 255;
  return removed;
}

export function photoCanvas(photo: HTMLImageElement) {
  const scale = Math.min(1, 1200 / Math.max(photo.naturalWidth, photo.naturalHeight));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
  return canvas;
}

export function automaticCutout(photo: HTMLImageElement): string | undefined {
  const canvas = photoCanvas(photo), ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No se pudo preparar la prenda.");
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), removed = uniformBackground(pixels);
  if (!removed) return;
  for (let p = 0; p < removed.length; p++) { const i = p * 4; pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255; pixels.data[i + 3] = removed[p]; }
  ctx.putImageData(pixels, 0, 0); return canvas.toDataURL("image/png");
}
