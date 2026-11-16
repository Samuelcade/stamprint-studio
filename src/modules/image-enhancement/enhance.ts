export interface Enhancement { brightness: number; contrast: number; saturation: number }

const clamp = (value: number) => Math.max(0, Math.min(255, value));
const copyImage = (image: ImageData) => typeof ImageData === "undefined"
  ? { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height } as ImageData
  : new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);

/** Applies display-independent raster adjustments to a working copy, never the source asset. */
export function enhance(image: ImageData, settings: Enhancement): ImageData {
  const result = copyImage(image);
  const contrast = (259 * (settings.contrast + 255)) / (255 * (259 - settings.contrast));
  for (let i = 0; i < result.data.length; i += 4) {
    let r = contrast * (result.data[i] - 128) + 128 + settings.brightness * 2.55;
    let g = contrast * (result.data[i + 1] - 128) + 128 + settings.brightness * 2.55;
    let b = contrast * (result.data[i + 2] - 128) + 128 + settings.brightness * 2.55;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const saturation = 1 + settings.saturation / 100;
    r = luminance + (r - luminance) * saturation;
    g = luminance + (g - luminance) * saturation;
    b = luminance + (b - luminance) * saturation;
    result.data[i] = clamp(r); result.data[i + 1] = clamp(g); result.data[i + 2] = clamp(b);
  }
  return result;
}
