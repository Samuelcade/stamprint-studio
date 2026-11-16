import { expect, it } from "vitest";
import { removeWhiteHalo } from "./whiteHalo";

function sample() {
  const width = 11, height = 11, data = new Uint8ClampedArray(width * height * 4);
  const pixel = (x: number, y: number, rgba: number[]) => data.set(rgba, (y * width + x) * 4);
  for (let y = 2; y <= 8; y++) for (let x = 2; x <= 8; x++) pixel(x, y, [255, 0, 0, 255]);
  pixel(1, 4, [255, 128, 128, 128]); pixel(1, 6, [255, 255, 255, 255]);
  pixel(5, 5, [255, 255, 255, 255]);
  return { width, height, data };
}
const pixel = (data: Uint8ClampedArray, x: number, y: number) => [...data.slice((y * 11 + x) * 4, (y * 11 + x) * 4 + 4)];

it("descontamina bordes suavizados, elimina el filo opaco y conserva blanco interior y transparencia", () => {
  const image = sample(), before = new Uint8ClampedArray(image.data), clean = removeWhiteHalo(image, 100);
  expect(pixel(clean, 1, 4)).toEqual([255, 0, 0, 128]);
  expect(pixel(clean, 1, 6)[3]).toBe(0);
  expect(pixel(clean, 5, 5)).toEqual([255, 255, 255, 255]);
  expect(pixel(clean, 0, 0)).toEqual([0, 0, 0, 0]);
  expect(image.data).toEqual(before);
});

it("regula la intensidad de la corrección", () => {
  const image = sample();
  expect(removeWhiteHalo(image, 0)).toEqual(image.data);
  expect(pixel(removeWhiteHalo(image, 50), 1, 4)).toEqual([255, 64, 64, 128]);
});

it("conserva objetos blancos y fotografías sin transparencia", () => {
  const white = { width: 11, height: 11, data: new Uint8ClampedArray(11 * 11 * 4) };
  for (let y = 2; y <= 8; y++) for (let x = 2; x <= 8; x++) white.data.set([255, 255, 255, 255], (y * 11 + x) * 4);
  expect(removeWhiteHalo(white, 100)).toEqual(white.data);
  const opaque = sample();
  for (let i = 3; i < opaque.data.length; i += 4) opaque.data[i] = 255;
  expect(removeWhiteHalo(opaque, 100)).toEqual(opaque.data);
});
