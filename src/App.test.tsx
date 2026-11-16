// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { App } from "./App";
import { listProjects, loadLatestProject, loadProject, saveProject } from "./modules/storage/projectStore";
import { defaultEffects } from "./modules/graphic-editor/model";
import { installTestCanvas, testImage } from "./modules/graphic-editor/testCanvas";
import type { Project } from "./core/types";
import { emptyVectorSession } from "./modules/vectorization/vector";
import { saveVectorSession } from "./modules/vectorization/store";

vi.mock("./modules/textile-3d/Textile3DStudio", () => ({ Textile3DStudio: ({ designSource, designSizeCm }: { designSource: string; designSizeCm: number }) => <div data-testid="3d-boundary" data-source={designSource} data-cm={designSizeCm} /> }));
let initial: Project;
beforeEach(async () => {
  localStorage.clear();
  installTestCanvas(); vi.stubGlobal("indexedDB", new IDBFactory());
  initial = { id: "persisted", name: "Diseño guardado", width: 254, height: 300, dpi: 100, updatedAt: new Date().toISOString(), layers: [{ kind: "image", id: "image", name: "Imagen", source: testImage(), mask: "", pixelWidth: 100, pixelHeight: 100, width: 100, height: 100, x: 127, y: 150, rotation: 0, opacity: 1, locked: false, visible: true, effects: { ...defaultEffects } }] };
  await saveProject(initial);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
async function open() {
  render(<App />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Editor gráfico" }) as HTMLButtonElement).disabled).toBe(false), { timeout: 5000 });
  await userEvent.click(screen.getByRole("button", { name: "Editor gráfico" }));
}
describe("editor application flow", () => {
  it("limita deshacer al editor y lo bloquea mientras se elige un proyecto", async () => {
    await open(); await userEvent.click(screen.getByRole("button", { name: "+ Texto" }));
    await userEvent.click(screen.getByRole("button", { name: "Cargar proyecto" }));
    await screen.findByRole("dialog", { name: "Cargar proyecto" });
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    await userEvent.click(screen.getByRole("button", { name: "Cerrar selector" }));
    expect(screen.getByLabelText("Contenido del texto")).toBeTruthy();
    for (const section of ["Proyectos", "Configuración", "Inicio"]) {
      await userEvent.click(screen.getByRole("button", { name: section }));
      expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
      await userEvent.click(screen.getByRole("button", { name: "Editor gráfico" }));
      expect(screen.getByLabelText("Contenido del texto")).toBeTruthy();
    }
    fireEvent.keyDown(screen.getByLabelText("Lienzo del diseño"), { key: "z", ctrlKey: true });
    expect(screen.queryByLabelText("Contenido del texto")).toBeNull();
  });
  it("guarda con Ctrl+S desde los campos y crea una copia con Ctrl+Mayús+S", async () => {
    await open(); await userEvent.click(screen.getByRole("button", { name: "Documento" }));
    const field = screen.getByLabelText("Nombre del proyecto");
    fireEvent.change(field, { target: { value: "Guardado por teclado" } });
    expect(fireEvent.keyDown(field, { key: "s", ctrlKey: true })).toBe(false);
    await waitFor(async () => expect((await loadProject(initial.id))?.name).toBe("Guardado por teclado"));
    await waitFor(() => expect((screen.getByRole("button", { name: "Guardar copia" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.keyDown(window, { key: "S", ctrlKey: true, shiftKey: true });
    await waitFor(async () => expect(await listProjects()).toHaveLength(2));
    expect((await listProjects()).some(project => project.name === "Guardado por teclado (copia)")).toBe(true);
  });
  it("elimina proyectos desde la biblioteca y el selector sin que el autoguardado los recree", async () => {
    await saveProject({ ...initial, id: "other", name: "Otro proyecto", updatedAt: "2020-01-01T00:00:00.000Z" });
    await open();
    fireEvent.change(screen.getByLabelText("Nombre de capa"), { target: { value: "Edición pendiente" } });
    await userEvent.click(screen.getByRole("button", { name: "Proyectos" }));
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar Diseño guardado" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Abrir Diseño guardado" })).toBeNull());
    await new Promise(resolve => setTimeout(resolve, 850));
    expect(await loadProject(initial.id)).toBeUndefined();
    expect((await loadProject("other"))?.name).toBe("Otro proyecto");
    await userEvent.click(screen.getByRole("button", { name: "Editor gráfico" }));
    await userEvent.click(screen.getByRole("button", { name: "Cargar proyecto" }));
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar Otro proyecto" }));
    await screen.findByText("No hay proyectos guardados del editor. Usa Guardar proyecto para añadir uno.");
    expect(await listProjects()).toHaveLength(0);
    cleanup(); await open();
    await userEvent.click(screen.getByRole("button", { name: "Proyectos" }));
    expect(await screen.findByText("No hay proyectos guardados del editor. Usa Guardar proyecto para añadir uno.")).toBeTruthy();
  });
  it("guarda copias independientes y permite elegirlas desde Cargar proyecto", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Guardar copia" }));
    await waitFor(async () => expect(await listProjects()).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("status", { name: "Estado del editor" }).textContent).toContain("Copia guardada"));
    await userEvent.click(screen.getByRole("button", { name: "Cargar proyecto" }));
    await screen.findByRole("dialog", { name: "Cargar proyecto" });
    await userEvent.click(await screen.findByRole("button", { name: "Abrir Diseño guardado" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Documento" }));
    expect((screen.getByLabelText("Nombre del proyecto") as HTMLInputElement).value).toBe("Diseño guardado");
    await userEvent.click(screen.getByRole("button", { name: "Proyectos" }));
    await userEvent.click(await screen.findByRole("button", { name: "Abrir Diseño guardado (copia)" }));
    await userEvent.click(await screen.findByRole("button", { name: "Documento" }));
    expect((screen.getByLabelText("Nombre del proyecto") as HTMLInputElement).value).toBe("Diseño guardado (copia)");
    expect((await loadProject(initial.id))?.name).toBe(initial.name);
    cleanup(); await open();
    await userEvent.click(screen.getByRole("button", { name: "Proyectos" }));
    expect(await screen.findByRole("button", { name: "Abrir Diseño guardado" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abrir Diseño guardado (copia)" })).toBeTruthy();
  });
  it("abre el semitono elegido y termina el autoguardado anterior sin sobrescribir otro proyecto", async () => {
    const second: Project = { ...initial, id: "other", name: "Otro semitono", updatedAt: "2020-01-01T00:00:00.000Z", layers: initial.layers.map(layer => ({ ...layer, effects: { ...layer.effects, halftone: true } })) };
    await saveProject(second);
    await open();
    fireEvent.change(screen.getByLabelText("Nombre de capa"), { target: { value: "Cambio pendiente" } });
    await userEvent.click(screen.getByRole("button", { name: "Proyectos" }));
    await userEvent.click(await screen.findByRole("button", { name: "Abrir Otro semitono" }));
    expect(await screen.findByRole("region", { name: "Configuración de semitonos" })).toBeTruthy();
    expect((screen.getByLabelText("Activar semitonos") as HTMLInputElement).checked).toBe(true);
    expect((await loadProject(initial.id))?.layers[0].name).toBe("Cambio pendiente");
    expect((await loadProject(second.id))?.layers[0].name).toBe("Imagen");
    expect((screen.getByLabelText("Nombre de capa") as HTMLInputElement).value).toBe("Imagen");
  });
  it("saves halftone print settings and restores them when reopening the module", async () => {
    await open(); await userEvent.click(screen.getByRole("button", { name: "Semitonos" }));
    await userEvent.click(screen.getByLabelText("Activar semitonos"));
    await userEvent.selectOptions(screen.getByLabelText("Preajuste de trama"), "30");
    await userEvent.selectOptions(screen.getByLabelText("Forma de trama"), "square");
    await waitFor(async () => expect((await loadLatestProject())?.layers[0].effects.halftoneOptions?.shape).toBe("square"), { timeout: 3000 });
    cleanup(); await open(); await userEvent.click(screen.getByRole("button", { name: "Semitonos" }));
    expect((screen.getByLabelText("Activar semitonos") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Forma de trama") as HTMLSelectElement).value).toBe("square");
    expect((screen.getByRole("slider", { name: "Frecuencia (LPI)" }) as HTMLInputElement).value).toBe("30");
    expect((screen.getByLabelText("Ancho del objeto (cm)") as HTMLInputElement).value).toBe("2.54");
  });
  it("opens vectorization, keeps its history separate, adds the result at its cm size and returns to the saved vector", async () => {
    await saveVectorSession({ ...emptyVectorSession(), name: "Vector de prueba", source: testImage(), widthCm: 2.54, result: { width: 100, height: 80, paths: [{ id: "red", color: "#ff0000", visible: true, contours: [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }]] }] } });
    await open(); await userEvent.click(screen.getByRole("button", { name: "+ Texto" }));
    await userEvent.click(screen.getByRole("button", { name: "Vectorización" }));
    await screen.findByRole("button", { name: "Descargar SVG" });
    await userEvent.click(screen.getByLabelText("Redondear curvas"));
    fireEvent.keyDown(screen.getByLabelText("Resultado vectorial"), { key: "z", ctrlKey: true });
    expect((screen.getByLabelText("Redondear curvas") as HTMLInputElement).checked).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Añadir PNG al editor" }));
    const name = await screen.findByLabelText("Nombre de capa"); expect((name as HTMLInputElement).value).toBe("Vector de prueba (vector)");
    expect((screen.getByLabelText("Ancho del objeto (cm)") as HTMLInputElement).value).toBe("2.54");
    expect((screen.getByLabelText("Alto del objeto (cm)") as HTMLInputElement).value).toBe("2.03");
    expect(screen.getByRole("button", { name: "Ocultar Texto" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(screen.queryByRole("button", { name: "Ocultar Vector de prueba (vector)" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ocultar Texto" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Vectorización" })); await screen.findByRole("button", { name: "Descargar SVG" });
    expect((screen.getByLabelText("Nombre del vector") as HTMLInputElement).value).toBe("Vector de prueba");
    await userEvent.click(screen.getByRole("button", { name: "Usar diseño del editor" }));
    await screen.findByAltText("Imagen original para vectorizar");
    expect(screen.queryByLabelText("Resultado vectorial")).toBeNull();
    expect((screen.getByLabelText("Ancho vector (cm)") as HTMLInputElement).valueAsNumber).toBeCloseTo(6.45);
  });
  it("loads saved layers, autosaves edits and restores them after reopening", async () => {
    await open(); expect((screen.getByLabelText("Nombre de capa") as HTMLInputElement).value).toBe("Imagen");
    await userEvent.click(screen.getByRole("button", { name: "Documento" }));
    expect((screen.getByLabelText("Resolución (DPI)") as HTMLSelectElement).value).toBe("100");
    fireEvent.change(screen.getByLabelText("Nombre del proyecto"), { target: { value: "Trabajo final" } }); fireEvent.blur(screen.getByLabelText("Nombre del proyecto"));
    await waitFor(async () => expect((await loadLatestProject())?.name).toBe("Trabajo final"), { timeout: 3000 });
    cleanup(); await open(); await userEvent.click(screen.getByRole("button", { name: "Documento" }));
    expect((screen.getByLabelText("Nombre del proyecto") as HTMLInputElement).value).toBe("Trabajo final");
    expect((await loadLatestProject())?.layers).toEqual(initial.layers);
  });
  it("exports actual document dimensions/DPI and sends the composition at its physical size to 3D", async () => {
    let output: Blob | undefined;
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn((blob: Blob) => { output = blob; return "blob:test"; }), revokeObjectURL: vi.fn() }));
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("Diseño guardado.png"); });
    await open(); await userEvent.click(screen.getByRole("button", { name: "Documento" }));
    fireEvent.change(screen.getByLabelText("Ancho del documento (cm)"), { target: { value: "2.54" } });
    fireEvent.change(screen.getByLabelText("Alto del documento (cm)"), { target: { value: "5.08" } });
    await userEvent.selectOptions(screen.getByLabelText("Resolución (DPI)"), "150");
    await userEvent.click(screen.getByRole("button", { name: "Aplicar medidas" }));
    await userEvent.click(screen.getByRole("button", { name: "Exportar PNG" })); await waitFor(() => expect(download).toHaveBeenCalled());
    const bytes = new Uint8Array(await output!.arrayBuffer()), view = new DataView(bytes.buffer);
    expect(view.getUint32(16)).toBe(150); expect(view.getUint32(20)).toBe(300);
    let phys = -1;
    for (let offset = 8; offset < bytes.length; offset += view.getUint32(offset) + 12) if (String.fromCharCode(...bytes.slice(offset + 4, offset + 8)) === "pHYs") phys = offset;
    expect(phys).toBeGreaterThan(0); expect(view.getUint32(phys + 8)).toBe(5906); expect(view.getUint32(phys + 12)).toBe(5906); expect(bytes[phys + 16]).toBe(1);
    await userEvent.click(screen.getByRole("button", { name: "Ver en camiseta 3D" }));
    const boundary = await screen.findByTestId("3d-boundary"); expect(Number(boundary.dataset.cm)).toBeCloseTo(5.08); expect(boundary.dataset.source).toMatch(/^data:image\/png/);
    await userEvent.click(screen.getByRole("button", { name: "Editor gráfico" }));
    expect((screen.getByLabelText("Nombre de capa") as HTMLInputElement).value).toBe("Imagen");
  });
  it("supports undo/redo shortcuts while preserving native text-input undo behavior", async () => {
    await open(); await userEvent.click(screen.getByRole("button", { name: "+ Texto" }));
    const canvas = screen.getByLabelText("Lienzo del diseño"); fireEvent.keyDown(canvas, { key: "z", ctrlKey: true });
    expect(screen.queryByLabelText("Contenido del texto")).toBeNull();
    fireEvent.keyDown(canvas, { key: "z", ctrlKey: true, shiftKey: true }); expect(screen.getByLabelText("Contenido del texto")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Contenido del texto"), { target: { value: "Impresión" } });
    fireEvent.keyDown(screen.getByLabelText("Contenido del texto"), { key: "z", ctrlKey: true });
    expect((screen.getByLabelText("Contenido del texto") as HTMLTextAreaElement).value).toBe("Impresión");
    await userEvent.click(screen.getByRole("button", { name: "Deshacer" })); expect((screen.getByLabelText("Contenido del texto") as HTMLTextAreaElement).value).toBe("TU DISEÑO");
    fireEvent.keyDown(canvas, { key: "y", ctrlKey: true }); expect((screen.getByLabelText("Contenido del texto") as HTMLTextAreaElement).value).toBe("Impresión");
  });
});
