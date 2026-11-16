/** Decontaminate a narrow transparent-edge band using nearby solid foreground colors. */
export function removeWhiteHalo(image: { width: number; height: number; data: Uint8ClampedArray }, intensity: number): Uint8ClampedArray {
  const { width, height, data } = image, result = new Uint8ClampedArray(data);
  const strength = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity / 100)) : 0;
  if (!strength) return result;
  const distance = new Uint8Array(width * height).fill(4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x;
    if (data[p * 4 + 3] === 0) distance[p] = 0;
    else distance[p] = Math.min(distance[p], x ? distance[p - 1] + 1 : 4, y ? distance[p - width] + 1 : 4);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const p = y * width + x;
    distance[p] = Math.min(distance[p], x + 1 < width ? distance[p + 1] + 1 : 4, y + 1 < height ? distance[p + width] + 1 : 4);
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x, offset = p * 4, alpha = data[offset + 3];
    if (!alpha || distance[p] > 2) continue;
    let reference = -1, nearest = Infinity;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx, ny = y + dy, squared = dx * dx + dy * dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || squared >= nearest) continue;
      const q = ny * width + nx, i = q * 4;
      if (distance[q] <= distance[p] || data[i + 3] < 240 || Math.min(data[i], data[i + 1], data[i + 2]) > 220) continue;
      reference = i; nearest = squared;
    }
    if (reference < 0) continue;
    // Estimate the amount of white mixed into this edge; reject unrelated colors.
    let numerator = 0, denominator = 0;
    for (let c = 0; c < 3; c++) {
      const toWhite = 255 - data[reference + c];
      numerator += (data[offset + c] - data[reference + c]) * toWhite;
      denominator += toWhite * toWhite;
    }
    const white = Math.max(0, Math.min(1, numerator / denominator));
    if (white < .02) continue;
    let error = 0;
    for (let c = 0; c < 3; c++) error += (data[offset + c] - (data[reference + c] + white * (255 - data[reference + c]))) ** 2;
    if (error > 3 * 24 ** 2) continue;
    for (let c = 0; c < 3; c++) {
      const clean = white > .95 ? data[reference + c] : Math.max(0, Math.min(255, (data[offset + c] - 255 * white) / (1 - white)));
      result[offset + c] = data[offset + c] + (clean - data[offset + c]) * strength;
    }
    // Opaque white fringe needs coverage correction; existing soft edges retain their alpha.
    if (alpha === 255 || white > .95) result[offset + 3] = alpha * (1 - white * strength);
  }
  return result;
}
