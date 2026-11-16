// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { VectorStudio } from "./VectorStudio";
import { emptyVectorSession, VectorResult } from "./vector";
import { loadVectorSession, saveVectorSession } from "./store";
import { installTestCanvas, testImage } from "../graphic-editor/testCanvas";
import { dpiFor8K, rasterizeVector } from "./io";

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage?: (event: { data: unknown }) => void; onerror?: (event: { preventDefault: () => void }) => void;
  terminate = vi.fn(); postMessage = vi.fn();
  constructor() { TestWorker.instances.push(this); }
  emit(data: unknown) { this.onmessage?.({ data }); }
}
const vector = (): VectorResult => ({ width: 100, height: 80, paths: [{ id: "red", color: "#ff0000", visible: true, contours: [[{ x: 10, y: 10 }, { x: 70, y: 10 }, { x: 70, y: 60 }, { x: 10, y: 60 }]] }, { id: "blue", color: "#0000ff", visible: true, contours: [[{ x: 75, y: 10 }, { x: 95, y: 10 }, { x: 95, y: 50 }, { x: 75, y: 50 }]] }] });
const useEditor = vi.fn(), addToEditor = vi.fn();
beforeEach(() => {
  installTestCanvas(); vi.stubGlobal("indexedDB", new IDBFactory()); vi.stubGlobal("Worker", TestWorker); TestWorker.instances = [];
  useEditor.mockReset().mockResolvedValue({ source: testImage(), name: "Del editor", widthCm: 25 }); addToEditor.mockReset();
  Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", { configurable: true, value: () => ({ inverse: () => ({}) }) });
  vi.stubGlobal("DOMPoint", class { constructor(public x: number, public y: number) {} matrixTransform() { return this; } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function open(result?: VectorResult) {
  if (result) await saveVectorSession({ ...emptyVectorSession(), name: "Logo", source: testImage(), result, widthCm: 2.54 });
  render(<VectorStudio hasEditorDesign onUseEditor={useEditor} onAddToEditor={addToEditor} />);
  await screen.findByRole("button", { name: "Usar diseño del editor" });
}
const click = async (name: string) => userEvent.click(screen.getByRole("button", { name }));
async function generate() {
  await click("Usar diseño del editor"); await waitFor(() => expect(screen.getByRole("button", { name: "Vectorizar" }).closest("fieldset")!.disabled).toBe(false));
  await click("Vectorizar"); const worker = TestWorker.instances.at(-1)!;
  act(() => worker.emit({ type: "done", result: vector() })); return worker;
}
describe("vector studio controls", () => {
  it("changes the actual preview size when zooming out and fits both comparison panels equally", async () => {
    await open(vector());
    const svg = screen.getByLabelText("Resultado vectorial") as unknown as SVGSVGElement;
    const originalWidth = parseFloat(svg.style.width);
    await click("Alejar vector"); expect(parseFloat(svg.style.width)).toBeCloseTo(originalWidth / 1.25);
    await click("Ajustar vector"); expect(parseFloat(svg.style.width)).toBeCloseTo(originalWidth);
    await click("Comparar");
    expect((screen.getByAltText("Imagen original para vectorizar") as HTMLImageElement).style.width).toBe(svg.style.width);
    expect(parseFloat(svg.style.width)).toBeLessThan(originalWidth);
  });
  it("does not move a node or add history on a click, and groups held arrow keys into one undo", async () => {
    await open(vector()); await click("Seleccionar color 1"); await userEvent.click(screen.getByLabelText("Editar nodos"));
    const node = screen.getByRole("button", { name: "Nodo 1-1" });
    fireEvent.pointerDown(node, { button: 0, clientX: 11, clientY: 12 }); fireEvent.pointerUp(node, { clientX: 11, clientY: 12 });
    expect((screen.getByRole("button", { name: "Deshacer vector" }) as HTMLButtonElement).disabled).toBe(true);
    for (let i = 0; i < 3; i++) fireEvent.keyDown(node, { key: "ArrowRight" }); fireEvent.keyUp(node, { key: "ArrowRight" });
    expect(screen.getByLabelText("Resultado vectorial").querySelector("path")!.getAttribute("d")).toMatch(/^M13 10/);
    await click("Deshacer vector"); expect(screen.getByLabelText("Resultado vectorial").querySelector("path")!.getAttribute("d")).toMatch(/^M10 10/);
    expect((screen.getByRole("button", { name: "Deshacer vector" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("cancels a node drag on view changes and prevents edits to hidden shapes", async () => {
    await open(vector()); await click("Seleccionar color 1"); await userEvent.click(screen.getByLabelText("Editar nodos"));
    let node = screen.getByRole("button", { name: "Nodo 1-1" });
    fireEvent.pointerDown(node, { button: 0, clientX: 10, clientY: 10 }); fireEvent.pointerMove(node, { clientX: 20, clientY: 25 });
    await click("Original"); fireEvent.pointerUp(node, { clientX: 20, clientY: 25 }); await click("Vector");
    expect(screen.getByLabelText("Resultado vectorial").querySelector("path")!.getAttribute("d")).toMatch(/^M10 10/);
    node = screen.getByRole("button", { name: "Nodo 1-1" }); fireEvent.focus(node); await click("Ocultar color 1");
    expect((screen.getByRole("button", { name: "Insertar nodo" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Eliminar nodo" }) as HTMLButtonElement).disabled).toBe(true);
    await click("Mostrar color 1"); expect(screen.getAllByRole("button", { name: /^Nodo/ })).toHaveLength(4);
  });
  it("marks unapplied tracing settings, clears the notice after regeneration and shows PNG dimensions", async () => {
    await open(); await generate();
    fireEvent.change(screen.getByRole("slider", { name: "Número de colores" }), { target: { value: "5" } });
    expect(screen.getByText(/Ajustes sin aplicar/)).toBeTruthy();
    await click("Volver a vectorizar"); act(() => TestWorker.instances.at(-1)!.emit({ type: "done", result: vector() }));
    expect(screen.queryByText(/Ajustes sin aplicar/)).toBeNull();
    expect(screen.getByLabelText("Dimensiones del PNG").textContent).toContain("2953 × 2362 px");
    await userEvent.selectOptions(screen.getByLabelText("Resolución del PNG"), "150");
    expect(screen.getByLabelText("Dimensiones del PNG").textContent).toContain("1476 × 1181 px");
  });
  it("ofrece trazado detallado y muestra la salida 8K proporcional", async () => {
    await open(vector());
    await userEvent.selectOptions(screen.getByLabelText("Preajuste"), "detailed");
    expect((screen.getByLabelText("Detalle de análisis") as HTMLSelectElement).value).toBe("2048");
    expect((screen.getByRole("slider", { name: "Número de colores" }) as HTMLInputElement).value).toBe("16");
    await userEvent.selectOptions(screen.getByLabelText("Calidad de exportación PNG"), "8k");
    expect(screen.getByLabelText("Dimensiones del PNG").textContent).toContain("7680 × 6144 px");
    expect(dpiFor8K(25.4, .5)).toBeCloseTo(384);
  });
  it("keeps the active preset visible and resets settings without discarding the edited vector", async () => {
    await open(vector());
    await userEvent.selectOptions(screen.getByLabelText("Preajuste"), "illustration");
    expect((screen.getByLabelText("Preajuste") as HTMLSelectElement).value).toBe("illustration");
    fireEvent.change(screen.getByRole("slider", { name: "Número de colores" }), { target: { value: "3" } });
    expect((screen.getByLabelText("Preajuste") as HTMLSelectElement).value).toBe("custom");
    await click("Restablecer ajustes"); expect((screen.getByRole("slider", { name: "Número de colores" }) as HTMLInputElement).value).toBe("8");
    expect((screen.getByLabelText("Detalle de análisis") as HTMLSelectElement).value).toBe("768");
    expect(screen.getByLabelText("Resultado vectorial").querySelectorAll("path")).toHaveLength(2);
    await click("Deshacer vector"); expect((screen.getByRole("slider", { name: "Número de colores" }) as HTMLInputElement).value).toBe("3");
  });
  it("rasterizes sharp edges at the requested resolution and rejects oversized PNGs", async () => {
    const session = { ...emptyVectorSession(), result: vector(), widthCm: 2.54 };
    for (const dpi of [300, 600]) {
      const canvas = await rasterizeVector(session, dpi), ctx = canvas.getContext("2d")!, edge = dpi / 10;
      expect(canvas.width).toBe(dpi); expect(canvas.height).toBe(dpi * .8);
      expect(ctx.getImageData(edge - 1, edge + 5, 1, 1).data[3]).toBe(0);
      expect(ctx.getImageData(edge, edge + 5, 1, 1).data[3]).toBe(255);
    }
    const thin = { ...session, result: { ...vector(), width: 1000, height: 10 } };
    const highResolution = await rasterizeVector(thin, dpiFor8K(thin.widthCm, 100));
    expect(highResolution.width).toBe(7680); expect(highResolution.height).toBe(77);
    await expect(rasterizeVector({ ...session, widthCm: 100 }, 600)).rejects.toThrow(/supera 8192/);
  });
  it("reports damaged saved data without overwriting it with an empty project", async () => {
    await saveVectorSession({ ...emptyVectorSession(), result: { ...vector(), width: 0 } });
    await open(); expect(screen.getByRole("alert").textContent).toContain("No se pudo recuperar");
    await expect(loadVectorSession()).rejects.toThrow(/no es válido/);
  });
  it("persists an immediate undo even when an earlier autosave is still queued", async () => {
    await open(vector());
    fireEvent.change(screen.getByLabelText("Nombre del vector"), { target: { value: "Cambio temporal" } });
    fireEvent.blur(screen.getByLabelText("Nombre del vector"));
    fireEvent.click(screen.getByRole("button", { name: "Deshacer vector" }));
    expect((screen.getByLabelText("Nombre del vector") as HTMLInputElement).value).toBe("Logo");
    expect((await loadVectorSession())?.name).toBe("Logo");
  });
  it("accepts decimal measurements while typing and restores an invalid or empty field", async () => {
    await open(vector());
    const width = screen.getByLabelText("Ancho vector (cm)") as HTMLInputElement;
    await userEvent.clear(width); await userEvent.type(width, "0.75"); fireEvent.blur(width);
    expect(width.value).toBe("0.75"); expect((screen.getByLabelText("Alto vector (cm)") as HTMLInputElement).value).toBe("0.6");
    await userEvent.clear(width); fireEvent.blur(width); expect(width.value).toBe("0.75");
    fireEvent.change(width, { target: { value: "9999" } }); fireEvent.blur(width); expect(width.value).toBe("0.75");
    await click("Deshacer vector"); expect(width.value).toBe("2.54");
  });
  it("loads editor artwork, adjusts trace settings, reports progress, generates actual path elements and compares", async () => {
    await open(); await click("Usar diseño del editor");
    await waitFor(() => expect(useEditor).toHaveBeenCalled()); await screen.findByAltText("Imagen original para vectorizar");
    await userEvent.selectOptions(screen.getByLabelText("Preajuste"), "cut");
    expect((screen.getByLabelText("Modo de vectorización") as HTMLSelectElement).value).toBe("mono");
    fireEvent.change(screen.getByRole("slider", { name: "Umbral monocromo" }), { target: { value: "190" } });
    await userEvent.click(screen.getByLabelText("Invertir selección tonal")); await userEvent.click(screen.getByLabelText("Quitar blanco"));
    await userEvent.selectOptions(screen.getByLabelText("Detalle de análisis"), "512");
    await click("Vectorizar"); const worker = TestWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ mode: "mono", threshold: 190, invert: true, removeWhite: true, resolution: 512 }) }));
    act(() => worker.emit({ type: "progress", progress: 50, stage: "Trazando contornos" })); expect(screen.getByText("50%")).toBeTruthy();
    act(() => worker.emit({ type: "done", result: vector() })); expect(worker.terminate).toHaveBeenCalled();
    expect(screen.getByLabelText("Resultado vectorial").querySelectorAll("path")).toHaveLength(2);
    await click("Comparar"); expect(screen.getByAltText("Imagen original para vectorizar")).toBeTruthy();
    await click("Contornos"); expect(screen.getByLabelText("Resultado vectorial").querySelector("path")?.getAttribute("fill")).toBe("none");
    await click("Acercar vector"); expect(screen.getByLabelText("Zoom vector").textContent).toBe("125%"); await click("Ajustar vector");
    await userEvent.selectOptions(screen.getByLabelText("Fondo de vectorización"), "dark"); expect(document.querySelector(".vector-bg-dark")).toBeTruthy();
  });
  it("cancels work, ignores late replies, handles errors and permits retry", async () => {
    await open(); await generate(); await click("Volver a vectorizar"); const worker = TestWorker.instances.at(-1)!;
    await click("Cancelar vectorización"); expect(worker.terminate).toHaveBeenCalled();
    act(() => worker.emit({ type: "done", result: { ...vector(), paths: [] } })); expect(screen.getByLabelText("Resultado vectorial").querySelectorAll("path")).toHaveLength(2);
    await click("Volver a vectorizar"); act(() => TestWorker.instances.at(-1)!.emit({ type: "error", message: "Sin formas visibles" })); expect(screen.getByRole("alert").textContent).toBe("Sin formas visibles");
    await click("Volver a vectorizar"); act(() => TestWorker.instances.at(-1)!.emit({ type: "done", result: vector() })); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("edits colors, visibility, curves and physical dimensions with undo/redo, and persists them", async () => {
    await open(vector()); await click("Seleccionar color 1");
    fireEvent.change(screen.getByLabelText("Color seleccionado"), { target: { value: "#22cc88" } });
    await click("Ocultar color 2"); expect(screen.getByLabelText("Resultado vectorial").querySelectorAll("path")).toHaveLength(1);
    await userEvent.click(screen.getByLabelText("Redondear curvas")); expect(screen.getByLabelText("Resultado vectorial").querySelector("path")!.getAttribute("d")).toContain("Q");
    fireEvent.change(screen.getByLabelText("Ancho vector (cm)"), { target: { value: "10" } }); fireEvent.blur(screen.getByLabelText("Ancho vector (cm)")); expect((screen.getByLabelText("Alto vector (cm)") as HTMLInputElement).value).toBe("8");
    fireEvent.change(screen.getByLabelText("Alto vector (cm)"), { target: { value: "4" } }); fireEvent.blur(screen.getByLabelText("Alto vector (cm)")); expect((screen.getByLabelText("Ancho vector (cm)") as HTMLInputElement).value).toBe("5");
    await click("Deshacer vector"); expect((screen.getByLabelText("Ancho vector (cm)") as HTMLInputElement).value).toBe("10");
    await click("Rehacer vector"); expect((screen.getByLabelText("Ancho vector (cm)") as HTMLInputElement).value).toBe("5");
    await waitFor(async () => expect((await loadVectorSession())?.widthCm).toBe(5));
    cleanup(); await open(); expect((screen.getByLabelText("Ancho vector (cm)") as HTMLInputElement).value).toBe("5");
    await click("Seleccionar color 1"); await click("Eliminar color seleccionado"); expect(screen.getByLabelText("Resultado vectorial").querySelectorAll("path")).toHaveLength(0);
    await click("Deshacer vector"); expect(screen.getByLabelText("Resultado vectorial").querySelectorAll("path")).toHaveLength(1);
  });
  it("moves nodes with pointer and keyboard, inserts/deletes vertices, and restores gestures with undo", async () => {
    await open(vector()); await click("Seleccionar color 1"); await userEvent.click(screen.getByLabelText("Editar nodos"));
    const node = screen.getByRole("button", { name: "Nodo 1-1" });
    fireEvent.pointerDown(node, { button: 0, clientX: 10, clientY: 10 }); fireEvent.pointerUp(node, { clientX: 15, clientY: 18 });
    expect(screen.getByLabelText("Resultado vectorial").querySelector("path")!.getAttribute("d")).toMatch(/^M15 18/);
    await click("Deshacer vector"); expect(screen.getByLabelText("Resultado vectorial").querySelector("path")!.getAttribute("d")).toMatch(/^M10 10/);
    fireEvent.focus(screen.getByRole("button", { name: "Nodo 1-1" })); fireEvent.keyDown(screen.getByRole("button", { name: "Nodo 1-1" }), { key: "ArrowRight" });
    expect(screen.getByLabelText("Resultado vectorial").querySelector("path")!.getAttribute("d")).toMatch(/^M11 10/);
    await click("Insertar nodo"); expect(screen.getAllByRole("button", { name: /^Nodo/ })).toHaveLength(5);
    await click("Eliminar nodo"); expect(screen.getAllByRole("button", { name: /^Nodo/ })).toHaveLength(4);
    fireEvent.focus(screen.getByRole("button", { name: "Nodo 1-1" })); await click("Eliminar nodo"); expect(screen.getAllByRole("button", { name: /^Nodo/ })).toHaveLength(3);
  });
  it("downloads a genuine SVG with the selected cm and only visible colors", async () => {
    let output: Blob | undefined;
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn((blob: Blob) => { output = blob; return "blob:vector"; }), revokeObjectURL: vi.fn() }));
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("Logo.svg"); });
    await open(vector()); await click("Ocultar color 2"); await click("Descargar SVG"); expect(download).toHaveBeenCalled();
    const text = new TextDecoder().decode(await output!.arrayBuffer()); expect(text).toContain('width="2.54cm"'); expect(text).toContain('height="2.032cm"'); expect(text).not.toContain("#0000ff"); expect(text).not.toContain("<image");
  });
  it("exports PNG with 300 DPI and sends a raster copy to the editor without losing cm", async () => {
    let output: Blob | undefined;
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn((blob: Blob) => { output = blob; return "blob:png"; }), revokeObjectURL: vi.fn() }));
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await open(vector()); await click("Descargar PNG"); await waitFor(() => expect(download).toHaveBeenCalled());
    const bytes = new Uint8Array(await output!.arrayBuffer()), view = new DataView(bytes.buffer); expect(view.getUint32(16)).toBe(300); expect(view.getUint32(20)).toBe(240);
    const index = new TextDecoder("latin1").decode(bytes).indexOf("pHYs"); expect(view.getUint32(index + 4)).toBe(11811);
    await click("Añadir PNG al editor"); await waitFor(() => expect(addToEditor).toHaveBeenCalledWith(expect.objectContaining({ widthCm: 2.54, width: 300, height: 240, source: expect.stringMatching(/^data:image\/png/) })));
  });
  it("imports a local image and recovers the previous vector after creating a new one", async () => {
    await open(vector()); await click("Nuevo vector"); expect(screen.queryByLabelText("Resultado vectorial")).toBeNull();
    await click("Deshacer vector"); expect(screen.getByLabelText("Resultado vectorial")).toBeTruthy();
    const bytes = Uint8Array.from(atob(testImage().split(",")[1]), char => char.charCodeAt(0));
    await userEvent.upload(screen.getByLabelText("Cargar imagen"), new File([bytes], "nuevo.png", { type: "image/png" }));
    await waitFor(() => expect(screen.queryByLabelText("Resultado vectorial")).toBeNull()); expect(screen.getByAltText("Imagen original para vectorizar")).toBeTruthy();
    await click("Deshacer vector"); expect(screen.getByLabelText("Resultado vectorial")).toBeTruthy();
  });
});
