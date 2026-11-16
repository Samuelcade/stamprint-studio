import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageData } from "@napi-rs/canvas";
import { HalftoneProcessor } from "./processor";
import { defaultHalftoneOptions, renderHalftone } from "./halftone";
class TestWorker {
  static instances: TestWorker[] = [];
  onmessage?: (event: { data: unknown }) => void; onerror?: (event: { preventDefault: () => void }) => void;
  postMessage = vi.fn(); terminate = vi.fn();
  constructor() { TestWorker.instances.push(this); }
}
const settings = { ...defaultHalftoneOptions, cellX: 8, cellY: 8 };
const input = () => { const image = new ImageData(16, 16); for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255; return image as unknown as globalThis.ImageData; };
beforeEach(() => { TestWorker.instances = []; vi.stubGlobal("Worker", TestWorker); vi.stubGlobal("ImageData", ImageData); });
afterEach(() => vi.unstubAllGlobals());
describe("halftone background processing", () => {
  it("transfers pixels to the worker, resolves the result and releases the worker", async () => {
    const processor = new HalftoneProcessor(), image = input(), result = processor.run("layer", image, settings), worker = TestWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledWith({ image, settings }, [image.data.buffer]);
    worker.onmessage!({ data: { result: renderHalftone(image, settings) } });
    expect((await result).data[3]).toBe(255); expect(worker.terminate).toHaveBeenCalled();
  });
  it("terminates superseded jobs and permits an independent layer to finish", async () => {
    const processor = new HalftoneProcessor(), first = processor.run("a", input(), settings);
    const rejected = expect(first).rejects.toThrow(/reemplazada/);
    const second = processor.run("a", input(), settings), other = processor.run("b", input(), settings);
    await rejected; expect(TestWorker.instances[0].terminate).toHaveBeenCalled();
    TestWorker.instances[1].onmessage!({ data: { result: input() } }); TestWorker.instances[2].onmessage!({ data: { result: input() } });
    await expect(second).resolves.toBeDefined(); await expect(other).resolves.toBeDefined();
  });
  it("returns worker errors and runs the production worker handler", async () => {
    const processor = new HalftoneProcessor(), failed = processor.run("bad", input(), settings);
    TestWorker.instances[0].onmessage!({ data: { error: "Ajustes inválidos" } }); await expect(failed).rejects.toThrow("Ajustes inválidos");
    const scope = { onmessage: undefined as undefined | ((event: { data: unknown }) => void), postMessage: vi.fn() }; vi.stubGlobal("self", scope);
    await import("./halftone.worker"); scope.onmessage!({ data: { image: input(), settings } });
    expect(scope.postMessage).toHaveBeenCalledWith(expect.objectContaining({ result: expect.objectContaining({ width: 16, height: 16 }) }), expect.any(Array));
    scope.postMessage.mockClear(); scope.onmessage!({ data: { image: input(), settings: { ...settings, cellX: 0 } } });
    expect(scope.postMessage).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("al menos 1") }));
  });
});
