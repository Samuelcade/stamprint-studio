// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QualityPanel } from "./QualityPanel";
import { defaultEffects } from "../graphic-editor/model";
import { installTestCanvas, testImage } from "../graphic-editor/testCanvas";
import type { RasterLayer } from "../../core/types";

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { preventDefault: () => void }) => void;
  postMessage = vi.fn(); terminate = vi.fn();
  constructor() { TestWorker.instances.push(this); }
  emit(data: unknown) { this.onmessage?.({ data }); }
}
const apply = vi.fn(), notice = vi.fn();
let layer: RasterLayer;
beforeEach(() => {
  installTestCanvas(); vi.stubGlobal("Worker", TestWorker); TestWorker.instances = []; apply.mockReset(); notice.mockReset();
  layer = { kind: "image", id: "a", name: "design.png", source: testImage(), mask: "", pixelWidth: 100, pixelHeight: 100, width: 250, height: 250, x: 300, y: 400, rotation: 20, opacity: .8, visible: true, locked: false, effects: { ...defaultEffects } };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const panel = (image = layer) => <QualityPanel layer={image} dpi={300} onApply={apply} notice={notice} />;
async function start() { await userEvent.click(screen.getByRole("button", { name: "Generar mejora" })); return TestWorker.instances.at(-1)!; }
async function finish(worker: TestWorker) {
  const bytes = Uint8Array.from(atob(layer.source.split(",")[1]), char => char.charCodeAt(0));
  act(() => worker.emit({ type: "done", blob: new Blob([bytes], { type: "image/png" }), width: 200, height: 200 }));
  await screen.findByRole("button", { name: "Aplicar a la capa" });
}
describe("quality controls", () => {
  it("selects resolution/sharpness, reports progress, compares and applies without changing cm or transforms", async () => {
    render(panel());
    await userEvent.selectOptions(screen.getByLabelText("Resolución de mejora"), "2x");
    fireEvent.change(screen.getByRole("slider", { name: "Nitidez de mejora" }), { target: { value: "60" } });
    const worker = await start(); expect(worker.postMessage).toHaveBeenCalledWith({ source: layer.source, mask: "", size: "2x", strength: 60 });
    act(() => worker.emit({ type: "progress", progress: 50, stage: "Ampliando" })); expect(screen.getByText("Ampliando · 50%")).toBeTruthy();
    await finish(worker); expect(worker.terminate).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Antes" })); expect(screen.getByAltText("Imagen antes de mejorar").getAttribute("src")).toBe(layer.source);
    await userEvent.click(screen.getByRole("button", { name: "Después" })); await userEvent.click(screen.getByLabelText("Ver detalle al 100%"));
    expect((screen.getByAltText("Imagen mejorada") as HTMLImageElement).style.width).toBe("200px");
    await userEvent.click(screen.getByRole("button", { name: "Aplicar a la capa" }));
    expect(apply).toHaveBeenCalledWith(layer, expect.objectContaining({ width: 250, height: 250, x: 300, y: 400, rotation: 20, opacity: .8, pixelWidth: 200, pixelHeight: 200 }));
    expect(screen.queryByRole("button", { name: "Aplicar a la capa" })).toBeNull();
  });
  it("cancels processing and ignores late replies after cancellation or switching images", async () => {
    const view = render(panel()); const worker = await start();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar mejora" })); expect(worker.terminate).toHaveBeenCalled();
    act(() => worker.emit({ type: "progress", progress: 70, stage: "Stale" })); expect(screen.queryByText(/Stale/)).toBeNull();
    const second = await start(); view.rerender(panel({ ...layer, id: "b" })); expect(second.terminate).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Cancelar mejora" })).toBeNull();
    const third = await start(); view.rerender(panel({ ...layer, id: "b", locked: true })); expect(third.terminate).toHaveBeenCalled();
  });
  it("recovers from worker errors and clears an old result when settings change", async () => {
    render(panel()); const worker = await start();
    act(() => worker.emit({ type: "error", message: "Imagen no válida" })); expect(screen.getByRole("alert").textContent).toBe("Imagen no válida");
    const next = await start(); await finish(next);
    await userEvent.selectOptions(screen.getByLabelText("Resolución de mejora"), "original");
    expect(screen.queryByRole("button", { name: "Aplicar a la capa" })).toBeNull(); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("downloads the improved PNG using full resolution and a descriptive name", async () => {
    let output: Blob | undefined;
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn((blob: Blob) => { output = blob; return "blob:test"; }), revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("design-200x200.png"); });
    render(panel()); await finish(await start());
    await userEvent.click(screen.getByRole("button", { name: "Descargar imagen mejorada" })); await waitFor(() => expect(click).toHaveBeenCalled());
    const bytes = new DataView(await output!.arrayBuffer()); expect(bytes.getUint32(16)).toBe(200); expect(bytes.getUint32(20)).toBe(200);
    expect(apply).not.toHaveBeenCalled();
  });
});
