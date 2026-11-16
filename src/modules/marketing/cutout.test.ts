import { expect, it } from "vitest";
import { uniformBackground } from "./cutout";

it("quita únicamente el fondo uniforme conectado al borde, conservando detalles interiores", () => {
  const width = 20, height = 20, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(x >= 5 && x < 15 && y >= 4 && y < 16 ? [240, 240, 240, 255] : [100, 100, 100, 255], (y * width + x) * 4);
  data.set([100, 100, 100, 255], (10 * width + 10) * 4);
  const mask = uniformBackground({ width, height, data })!;
  expect(mask[0]).toBe(255); expect(mask[10 * width + 5]).toBe(0);
  expect(mask[10 * width + 10]).toBe(0);
});

it("respeta la transparencia existente y no intenta recortar imágenes sin contraste", () => {
  const data = new Uint8ClampedArray(10 * 10 * 4); data.set([255, 255, 255, 255], (5 * 10 + 5) * 4);
  expect(uniformBackground({ width: 10, height: 10, data })).toEqual(new Uint8ClampedArray(100));
  data.fill(255); expect(uniformBackground({ width: 10, height: 10, data })).toBeUndefined();
});

it("rechaza el recorte de tela casi blanca sobre fondo blanco antes de borrar sus pliegues", () => {
  const width = 30, height = 30, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const garment = x >= 7 && x < 23 && y >= 5 && y < 25;
    const value = garment ? (x === 8 || x === 21 ? 190 : 239) : 252;
    data.set([value, value, value, 255], (y * width + x) * 4);
  }
  expect(uniformBackground({ width, height, data })).toBeUndefined();
});

it("rechaza costuras desconectadas cuando la tela se confunde con el fondo", () => {
  const width = 30, height = 30, data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 5; y < 25; y++) for (const x of [7, 8, 21, 22]) data.set([150, 150, 150, 255], (y * width + x) * 4);
  expect(uniformBackground({ width, height, data })).toBeUndefined();
});
