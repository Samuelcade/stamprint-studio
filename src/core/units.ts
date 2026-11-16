export const pixelsFromCentimeters = (centimeters: number, dpi: number) =>
  Math.round((centimeters / 2.54) * dpi);

export const centimetersFromPixels = (pixels: number, dpi: number) =>
  (pixels / dpi) * 2.54;
