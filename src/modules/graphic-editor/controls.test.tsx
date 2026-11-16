// @vitest-environment jsdom
import { useCallback, useReducer, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project, RasterLayer, TextLayer } from "../../core/types";
import { GraphicEditor, CommitProject } from "./GraphicEditor";
import { defaultEffects, historyReducer, HistoryState } from "./model";
import { ProjectRenderer } from "./render";
import { installTestCanvas, testImage } from "./testCanvas";

let state: HistoryState;
const preview = vi.fn();
function image(id = "image"): RasterLayer { return { kind: "image", id, name: id, source: testImage(), mask: "", pixelWidth: 100, pixelHeight: 100, x: 500, y: 500, width: 200, height: 100, rotation: 0, visible: true, locked: false, opacity: 1, effects: { ...defaultEffects } }; }
function documentWith(layers: Project["layers"] = [image()]): Project { return { id: "test", name: "Test", width: 1000, height: 1000, dpi: 100, updatedAt: "", layers }; }
function Harness({ initial = documentWith(), section = "Editor gráfico" }: { initial?: Project; section?: string }) {
  const [history, dispatch] = useReducer(historyReducer, { present: initial, past: [], future: [] });
  state = history; const current = useRef(history); current.current = history;
  const [renderer] = useState(() => new ProjectRenderer());
  const [status, setStatus] = useState("");
  const commit: CommitProject = useCallback((next, group) => { const previous = current.current.present; dispatch({ type: "commit", project: typeof next === "function" ? next(previous) : next, group }); }, []);
  const endGroup = useCallback(() => dispatch({ type: "end-group" }), []);
  return <><button onClick={() => dispatch({ type: "undo" })}>Deshacer</button><button onClick={() => dispatch({ type: "redo" })}>Rehacer</button>
    <GraphicEditor project={history.present} section={section} renderer={renderer} commit={commit} endGroup={endGroup} notice={setStatus} status={status} onPreview={() => preview(history.present)} onNew={() => commit(documentWith([]))} busy={false} />
  </>;
}
beforeEach(() => { installTestCanvas(); preview.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function click(name: string) { await userEvent.click(screen.getByRole("button", { name })); }
async function number(name: string, value: string) {
  const input = screen.getByRole("spinbutton", { name });
  fireEvent.change(input, { target: { value } }); fireEvent.blur(input);
}
const currentImage = () => state.present.layers[0] as RasterLayer;

describe("editor control interactions", () => {
  it("ajusta y deshace el cromado de cada imagen y texto por separado", async () => {
    render(<Harness />);
    await click("Aplicar cromado"); expect(currentImage().effects.chrome).toBe(100);
    const slider = screen.getByRole("slider", { name: "Intensidad del cromado" });
    fireEvent.change(slider, { target: { value: "60" } }); fireEvent.change(slider, { target: { value: "40" } }); fireEvent.pointerUp(slider);
    expect(currentImage().effects.chrome).toBe(40);
    await click("Deshacer"); expect(currentImage().effects.chrome).toBe(100);
    await click("Rehacer"); expect(currentImage().effects.chrome).toBe(40);
    await userEvent.selectOptions(screen.getByLabelText("Estilo del cromado"), "holographic");
    expect(currentImage().effects.chromeStyle).toBe("holographic");
    const relief = screen.getByRole("slider", { name: "Relieve del cromado" });
    fireEvent.change(relief, { target: { value: "95" } }); fireEvent.pointerUp(relief);
    expect(currentImage().effects.chromeRelief).toBe(95);
    await click("Deshacer"); expect(currentImage().effects.chromeRelief).toBeUndefined();
    await click("+ Texto"); await click("Aplicar cromado");
    expect(state.present.layers[1].effects.chrome).toBe(100); expect(currentImage().effects.chrome).toBe(40);
    await click("Quitar cromado"); expect(state.present.layers[1].effects.chrome).toBe(0);
    expect(currentImage().effects.chrome).toBe(40);
  });
  it("aplica limpieza de halo ajustable, la exporta y permite deshacer sin alterar el original", async () => {
    const source = document.createElement("canvas"); source.width = 100; source.height = 100;
    const ctx = source.getContext("2d")!; ctx.fillStyle = "#ff0000"; ctx.fillRect(30, 20, 40, 60);
    const pixels = ctx.getImageData(0, 0, 100, 100); pixels.data.set([255, 128, 128, 128], (50 * 100 + 29) * 4); ctx.putImageData(pixels, 0, 0);
    const original = source.toDataURL("image/png");
    const layer = { ...image(), source: original, x: 50, y: 50, width: 100, height: 100 };
    render(<Harness initial={{ ...documentWith([layer]), width: 100, height: 100 }} />);
    await click("Eliminar halo blanco");
    expect(currentImage().effects.whiteHalo).toBe(75);
    const control = screen.getByRole("slider", { name: "Intensidad del halo" });
    fireEvent.change(control, { target: { value: "90" } }); fireEvent.change(control, { target: { value: "100" } }); fireEvent.pointerUp(control);
    expect(currentImage().effects.whiteHalo).toBe(100);
    const rendered = await new ProjectRenderer().render(state.present, Infinity, true);
    const edge = rendered.getContext("2d")!.getImageData(29, 50, 1, 1).data;
    expect(edge[0]).toBe(255); expect(edge[1]).toBeLessThan(5); expect(edge[3]).toBe(128);
    expect(currentImage().source).toBe(original);
    await click("Deshacer"); expect(currentImage().effects.whiteHalo).toBe(75);
    await click("Deshacer"); expect(currentImage().effects.whiteHalo).toBeUndefined();
    await click("Rehacer"); expect(currentImage().effects.whiteHalo).toBe(75);
    await click("Desactivar limpieza de halo"); expect(currentImage().effects.whiteHalo).toBe(0);
  });
  it("exposes halftone controls in their module and commits one history step when a slider is released", async () => {
    render(<Harness section="Semitonos" />);
    expect(screen.getByRole("region", { name: "Configuración de semitonos" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Generar mejora" })).toBeNull();
    await userEvent.click(screen.getByLabelText("Activar semitonos"));
    const before = state.past.length, slider = screen.getByRole("slider", { name: "Tamaño de trama (px)" });
    fireEvent.change(slider, { target: { value: "12" } }); fireEvent.change(slider, { target: { value: "16" } });
    expect(currentImage().effects.halftoneCell).toBe(8);
    fireEvent.pointerUp(slider); expect(currentImage().effects.halftoneCell).toBe(16); expect(state.past.length).toBe(before + 1);
    await click("Deshacer"); expect(currentImage().effects.halftoneCell).toBe(8);
    fireEvent.change(slider, { target: { value: "24" } }); fireEvent.pointerCancel(slider); fireEvent.blur(slider); expect(currentImage().effects.halftoneCell).toBe(8);
    await userEvent.selectOptions(screen.getByLabelText("Preajuste de trama"), "30");
    await userEvent.selectOptions(screen.getByLabelText("Forma de trama"), "line");
    for (const [label, value] of [["Ángulo de trama", "22.5"], ["Intensidad de tonos", "1.5"]]) {
      const control = screen.getByRole("slider", { name: label }); fireEvent.change(control, { target: { value } }); fireEvent.keyUp(control, { key: "ArrowRight" });
    }
    await click("Tinta blanca"); await userEvent.click(screen.getByLabelText("Invertir tonos"));
    expect(currentImage().effects.halftoneOptions).toMatchObject({ unit: "lpi", lpi: 30, shape: "line", angle: 22.5, gamma: 1.5, ink: "#ffffff", invert: true });
    await click("Restablecer trama"); expect(currentImage().effects.halftoneOptions).toMatchObject({ unit: "source", shape: "circle", angle: 0, gamma: 1, ink: "#000000", invert: false });
    await click("Deshacer"); expect(currentImage().effects.halftoneOptions?.shape).toBe("line");
  });
  it("compares the original without changing the saved halftone or adding history", async () => {
    render(<Harness section="Semitonos" />); await userEvent.click(screen.getByLabelText("Activar semitonos"));
    const canvas = screen.getByLabelText("Lienzo del diseño") as HTMLCanvasElement;
    await waitFor(() => expect(canvas.getContext("2d")!.getImageData(410, 460, 1, 1).data[3]).toBe(0));
    const historyCount = state.past.length;
    await click("Ver original"); await waitFor(() => expect(canvas.getContext("2d")!.getImageData(410, 460, 1, 1).data[3]).toBe(255));
    expect(currentImage().effects.halftone).toBe(true); expect(state.past.length).toBe(historyCount);
    expect(screen.getByText(/La exportación conserva el semitono/)).toBeTruthy();
    await click("Ver semitono"); await waitFor(() => expect(canvas.getContext("2d")!.getImageData(410, 460, 1, 1).data[3]).toBe(0));
    await click("Bloquear image"); expect(screen.getByLabelText("Activar semitonos").closest("fieldset")!.disabled).toBe(true);
  });
  it("keeps halftone settings isolated between images and explains unsupported text layers", async () => {
    render(<Harness section="Semitonos" initial={documentWith([image("one"), image("two")])} />);
    await userEvent.click(screen.getByLabelText("Activar semitonos")); await click("Tinta blanca");
    await click("▧ one"); expect((screen.getByLabelText("Activar semitonos") as HTMLInputElement).checked).toBe(false);
    expect(state.present.layers[1].effects.halftoneOptions?.ink).toBe("#ffffff");
    await click("+ Texto"); expect(screen.getByText(/Los semitonos se aplican a capas de imagen/)).toBeTruthy();
  });
  it("changes width/height, preserves proportion, allows independent resizing and centers the object", async () => {
    render(<Harness />);
    await number("Ancho del objeto (cm)", "10.16");
    expect(currentImage().width).toBe(400); expect(currentImage().height).toBe(200);
    await number("Alto del objeto (cm)", "7.62");
    expect(currentImage().height).toBe(300); expect(currentImage().width).toBe(600);
    await userEvent.click(screen.getByLabelText("Mantener proporciones"));
    await number("Ancho del objeto (cm)", "5.08"); expect(currentImage().height).toBe(300); expect(currentImage().width).toBe(200);
    await number("Centro X (cm)", "1.27"); await number("Centro Y (cm)", "2.54");
    expect(currentImage()).toMatchObject({ x: 50, y: 100 });
    await number("Rotación (grados)", "45"); expect(currentImage().rotation).toBe(45);
    await click("Centrar"); expect(currentImage()).toMatchObject({ x: 500, y: 500 });
    await number("Ancho del objeto (cm)", ""); expect(Number.isFinite(currentImage().width)).toBe(true);
  });
  it("does not quantize untouched values when focus moves between fields", async () => {
    render(<Harness initial={documentWith([{ ...image(), width: 200.123456, height: 100.98765 }])} />);
    fireEvent.focus(screen.getByRole("spinbutton", { name: "Ancho del objeto (cm)" })); fireEvent.blur(screen.getByRole("spinbutton", { name: "Ancho del objeto (cm)" }));
    expect(currentImage().width).toBe(200.123456); expect(state.past.length).toBe(0);
  });
  it("keeps exact fractional cm and cancels an in-progress gesture when undo changes the document", async () => {
    render(<Harness />);
    await number("Ancho del objeto (cm)", "5.01");
    expect(currentImage().width / 100 * 2.54).toBeCloseTo(5.01, 10);
    const canvas = screen.getByLabelText("Lienzo del diseño");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(canvas, { clientX: 550, clientY: 530 });
    await click("Deshacer");
    fireEvent.pointerUp(canvas, { clientX: 550, clientY: 530 });
    expect(currentImage()).toMatchObject({ width: 200, x: 500, y: 500 });
    expect(state.past).toHaveLength(0);
  });
  it("groups project-name typing and restores the name in a single undo", async () => {
    render(<Harness />); await click("Documento");
    const name = screen.getByLabelText("Nombre del proyecto");
    fireEvent.change(name, { target: { value: "Prueba" } }); fireEvent.change(name, { target: { value: "Prueba final" } }); fireEvent.blur(name);
    expect(state.past).toHaveLength(1); await click("Deshacer"); expect(state.present.name).toBe("Test");
  });
  it("duplicates, reorders, hides, locks, unlocks and deletes layers without changing other layers", async () => {
    render(<Harness initial={documentWith([image("bottom"), image("top")])} />);
    await click("Duplicar"); expect(state.present.layers).toHaveLength(3); expect(state.present.layers[2].id).not.toBe("top");
    await click("Bajar capa"); expect(state.present.layers[1].name).toBe("top (copia)");
    await click("Subir capa"); expect(state.present.layers[2].name).toBe("top (copia)");
    await click("Ocultar top (copia)"); expect(state.present.layers[2].visible).toBe(false);
    await click("Mostrar top (copia)"); await click("Bloquear top (copia)"); expect(state.present.layers[2].locked).toBe(true);
    expect((screen.getByRole("button", { name: "Eliminar capa" }) as HTMLButtonElement).closest("fieldset")!.disabled).toBe(true);
    await click("Desbloquear top (copia)"); await click("Eliminar capa"); expect(state.present.layers).toHaveLength(2);
    await click("Deshacer"); expect(state.present.layers).toHaveLength(3);
    await click("Rehacer"); expect(state.present.layers).toHaveLength(2);
  });
  it("edits text, font, color, bold/italic and alignment and groups typing into one undo", async () => {
    render(<Harness />); await click("+ Texto");
    expect(state.present.layers).toHaveLength(2);
    const input = screen.getByLabelText("Contenido del texto");
    const before = state.past.length;
    fireEvent.change(input, { target: { value: "Hola" } }); fireEvent.change(input, { target: { value: "Hola\nmundo" } }); fireEvent.blur(input);
    expect(state.past.length).toBe(before + 1);
    await userEvent.selectOptions(screen.getByLabelText("Tipografía"), "Georgia");
    fireEvent.input(screen.getByLabelText("Color del texto"), { target: { value: "#ff1100" } }); fireEvent.blur(screen.getByLabelText("Color del texto"));
    await click("Negrita"); await click("Cursiva"); await userEvent.selectOptions(screen.getByLabelText("Alineación del texto"), "right");
    expect(state.present.layers[1]).toMatchObject({ kind: "text", text: "Hola\nmundo", fontFamily: "Georgia", color: "#ff1100", bold: false, italic: true, align: "right" });
  });
  it("handles dragging, scaling, rotation and one-step undo per gesture", async () => {
    render(<Harness />); const canvas = screen.getByLabelText("Lienzo del diseño");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(canvas, { clientX: 550, clientY: 530 }); fireEvent.pointerUp(canvas, { clientX: 550, clientY: 530 });
    expect(currentImage()).toMatchObject({ x: 550, y: 530 }); expect(state.past.length).toBe(1);
    const corner = screen.getByRole("button", { name: "Escalar objeto desde esquina 3" });
    fireEvent.pointerDown(corner, { button: 0, clientX: 650, clientY: 580 }); fireEvent.pointerMove(corner, { clientX: 750, clientY: 630 }); fireEvent.pointerUp(corner, { clientX: 750, clientY: 630 });
    expect(currentImage().width).toBeCloseTo(400); expect(currentImage().height).toBeCloseTo(200);
    const rotate = screen.getByRole("button", { name: "Girar objeto" });
    fireEvent.pointerDown(rotate, { button: 0, clientX: 550, clientY: 330 }); fireEvent.pointerMove(rotate, { clientX: 750, clientY: 530 }); fireEvent.pointerUp(rotate, { clientX: 750, clientY: 530 });
    expect(currentImage().rotation).toBeCloseTo(90); await click("Deshacer"); expect(currentImage().rotation).toBeCloseTo(0);
  });
  it("commits the final pointer position even if a fast drag has no pointermove", async () => {
    render(<Harness />); const canvas = screen.getByLabelText("Lienzo del diseño");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 500, clientY: 500 }); fireEvent.pointerUp(canvas, { clientX: 560, clientY: 510 });
    expect(currentImage()).toMatchObject({ x: 560, y: 510 });
  });
  it("cancels a gesture cleanly and does not move the old selection from empty canvas", async () => {
    render(<Harness />); const canvas = screen.getByLabelText("Lienzo del diseño");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 500, clientY: 500 }); fireEvent.pointerMove(canvas, { clientX: 570, clientY: 510 }); fireEvent.pointerCancel(canvas);
    expect(currentImage().x).toBe(500); expect(state.past.length).toBe(0);
    fireEvent.pointerDown(canvas, { button: 0, clientX: 50, clientY: 50 }); fireEvent.pointerMove(canvas, { clientX: 100, clientY: 100 }); fireEvent.pointerUp(canvas, { clientX: 100, clientY: 100 });
    expect(currentImage().x).toBe(500); expect(screen.queryByRole("button", { name: "Girar objeto" })).toBeNull();
  });
  it("supports keyboard movement, duplicate/delete, zoom, background and new document undo", async () => {
    render(<Harness />); const canvas = screen.getByLabelText("Lienzo del diseño");
    fireEvent.keyDown(canvas, { key: "ArrowRight", shiftKey: true }); fireEvent.keyUp(canvas, { key: "ArrowRight" }); expect(currentImage().x).toBe(510);
    fireEvent.keyDown(canvas, { key: "d", ctrlKey: true }); expect(state.present.layers).toHaveLength(2);
    fireEvent.keyDown(canvas, { key: "Delete" }); expect(state.present.layers).toHaveLength(1);
    await click("Acercar lienzo"); expect(screen.getByLabelText("Zoom del lienzo").textContent).toBe("120%");
    await click("Alejar lienzo"); await click("Ajustar"); expect(screen.getByLabelText("Zoom del lienzo").textContent).toBe("100%");
    await userEvent.selectOptions(screen.getByLabelText("Fondo de vista"), "dark"); expect(document.querySelector(".editor-background-dark")).not.toBeNull();
    await click("Ver en camiseta 3D"); expect(preview).toHaveBeenCalledWith(state.present);
    await click("Nuevo"); expect(state.present.layers.length).toBe(0); await click("Deshacer"); expect(state.present.layers.length).toBe(1);
  });
  it("updates document cm and DPI, preserving physical object size, and rejects excessive size", async () => {
    render(<Harness />); await click("Documento");
    fireEvent.change(screen.getByLabelText("Ancho del documento (cm)"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Alto del documento (cm)"), { target: { value: "30" } });
    await userEvent.selectOptions(screen.getByLabelText("Resolución (DPI)"), "300"); await click("Aplicar medidas");
    expect(state.present).toMatchObject({ width: 2953, height: 3543, dpi: 300 }); expect(currentImage()).toMatchObject({ width: 600, height: 300 });
    fireEvent.change(screen.getByLabelText("Ancho del documento (cm)"), { target: { value: "1000" } }); await click("Aplicar medidas"); expect(state.present.width).toBe(2953);
    expect(screen.getByRole("status", { name: "Estado del editor" }).textContent).toContain("6000");
  });
  it("changes opacity, mirror, brightness/contrast/saturation, halftone and underbase", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("slider", { name: "Opacidad" }), { target: { value: "40" } }); fireEvent.pointerUp(screen.getByRole("slider", { name: "Opacidad" }));
    await click("Espejo"); expect(currentImage()).toMatchObject({ opacity: .4, effects: { mirror: true } });
    for (const label of ["Brillo", "Contraste", "Saturación"]) fireEvent.change(screen.getByRole("slider", { name: label }), { target: { value: "20" } });
    expect(currentImage().effects).toMatchObject({ brightness: 20, contrast: 20, saturation: 20 });
    fireEvent.click(screen.getByText("Semitonos")); await userEvent.click(screen.getByLabelText("Activar semitonos"));
    fireEvent.change(screen.getByRole("slider", { name: "Tamaño de trama (px)" }), { target: { value: "12" } }); fireEvent.pointerUp(screen.getByRole("slider", { name: "Tamaño de trama (px)" })); fireEvent.click(screen.getByText("Base blanca DTF")); await userEvent.click(screen.getByLabelText("Previsualizar base blanca"));
    expect(currentImage().effects).toMatchObject({ halftone: true, halftoneCell: 12, whiteUnderbase: true });
  });
  it("removes and restores the clicked source pixels while preserving other layers", async () => {
    render(<Harness />); const canvas = screen.getByLabelText("Lienzo del diseño");
    await click("Eliminar color"); await userEvent.selectOptions(screen.getByLabelText("Modo"), "global");
    fireEvent.change(screen.getByRole("slider", { name: "Tolerancia" }), { target: { value: "15" } });
    fireEvent.pointerDown(canvas, { button: 0, clientX: 410, clientY: 460 });
    await waitFor(() => expect(currentImage().mask.startsWith("data:image/png")).toBe(true));
    const removed = currentImage().mask; await click("Restaurar");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 410, clientY: 460 });
    await waitFor(() => expect(currentImage().mask).not.toBe(removed)); await click("Seleccionar");
    expect(canvas.className).toBe("");
  });
  it("imports multiple image files as independent layers", async () => {
    render(<Harness initial={documentWith([])} />);
    const bytes = Uint8Array.from(atob(testImage().split(",")[1]), char => char.charCodeAt(0));
    await userEvent.upload(screen.getByLabelText("Agregar imágenes"), [new File([bytes], "one.png", { type: "image/png" }), new File([bytes], "two.png", { type: "image/png" })]);
    await waitFor(() => expect(state.present.layers).toHaveLength(2)); expect(state.present.layers.map(layer => layer.name)).toEqual(["one.png", "two.png"]);
  });
});
