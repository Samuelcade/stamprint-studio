import { vi } from "vitest";
import { Canvas, createCanvas, Image, ImageData } from "@napi-rs/canvas";

/** Test-only DOM/Canvas adapter. No browser or user session is controlled. */
export function installTestCanvas() {
  if (!Blob.prototype.arrayBuffer) Object.defineProperty(Blob.prototype, "arrayBuffer", { configurable: true, value: function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = reject; reader.readAsArrayBuffer(this); });
  } });
  const canvases = new WeakMap<HTMLCanvasElement, Canvas>();
  function backing(element: HTMLCanvasElement) {
    let result = canvases.get(element);
    if (!result) { result = createCanvas(element.width || 1, element.height || 1); canvases.set(element, result); }
    if (result.width !== element.width) result.width = element.width || 1;
    if (result.height !== element.height) result.height = element.height || 1;
    return result;
  }
  vi.stubGlobal("Image", Image); vi.stubGlobal("ImageData", ImageData);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    const ctx = backing(this).getContext("2d");
    return new Proxy(ctx, {
      get(target, property) {
        if (property === "drawImage") return (image: unknown, ...args: number[]) => {
          const actual = image instanceof HTMLCanvasElement ? backing(image) : image;
          Reflect.apply(target.drawImage, target, [actual, ...args]);
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(target, property, value) { Reflect.set(target, property, value, target); return true; },
    }) as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (this: HTMLCanvasElement) { return backing(this).toDataURL("image/png"); });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback: BlobCallback) {
    void backing(this).encode("png").then(data => callback(new Blob([new Uint8Array(data)], { type: "image/png" })));
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("PointerEvent", MouseEvent);
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const width = this.classList.contains("editor-board") ? 1000 : 800;
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: 1000, width, height: 1000, toJSON() {} };
  });
}

export function testImage() {
  const canvas = createCanvas(100, 100), ctx = canvas.getContext("2d");
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, 100, 100);
  ctx.fillStyle = "#ff0000"; ctx.fillRect(25, 25, 50, 50);
  return canvas.toDataURL("image/png");
}
