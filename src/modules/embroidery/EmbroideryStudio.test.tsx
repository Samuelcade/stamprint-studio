// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { installTestCanvas, testImage } from "../graphic-editor/testCanvas";
import { EmbroideryStudio } from "./EmbroideryStudio";

class FakeWorker { static instance: FakeWorker; onmessage?: (event: { data: unknown }) => void; postMessage = vi.fn(); terminate = vi.fn(); constructor() { FakeWorker.instance = this; } }
beforeEach(() => { installTestCanvas(); vi.stubGlobal("indexedDB", new IDBFactory()); vi.stubGlobal("Worker", FakeWorker); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("dibuja, guarda, recupera y descarga un diseño de referencia", async () => {
  const user = userEvent.setup(); render(<EmbroideryStudio hasEditorDesign onUseEditor={async () => ({ source: testImage(), name: "Arte" })} />);
  const board = screen.getByLabelText("Lienzo de bordado");
  fireEvent.pointerDown(board, { button: 0, clientX: 200, clientY: 200 }); fireEvent.pointerMove(board, { clientX: 400, clientY: 400 }); fireEvent.pointerUp(board, { clientX: 400, clientY: 400 });
  expect(board.querySelectorAll("polyline[data-path]")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Guardar proyecto" })); await waitFor(() => expect(screen.getByRole("status").textContent).toContain("guardado en este navegador"));
  await user.click(screen.getByRole("button", { name: "Eliminar trazo" })); expect(board.querySelectorAll("polyline[data-path]")).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Abrir proyecto guardado" })); await waitFor(() => expect(board.querySelectorAll("polyline[data-path]")).toHaveLength(1));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await user.click(screen.getByRole("button", { name: "Descargar SVG" })); expect(download).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Usar diseño del editor" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Crear contornos automáticamente" })).not.toHaveProperty("disabled", true));
  await user.click(screen.getByRole("button", { name: "Crear contornos automáticamente" }));
  expect(FakeWorker.instance.postMessage).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ mode: "mono" }) }));
  act(() => FakeWorker.instance.onmessage!({ data: { type: "done", result: { width: 100, height: 100, paths: [{ id: "a", color: "#000000", visible: true, contours: [[{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }]] }] } } }));
  expect(screen.getByRole("status").textContent).toContain("Contornos añadidos");
  expect(screen.getByRole("button", { name: "Trazo 2" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Deshacer" })); expect(screen.queryByRole("button", { name: "Trazo 2" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Rehacer" })); expect(screen.getByRole("button", { name: "Trazo 2" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Progreso de simulación"), { target: { value: "0" } });
  expect(board.querySelectorAll("polyline[data-path]")).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Ver diseño completo" }));
  await user.click(screen.getByRole("button", { name: "Crear relleno automático" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Relleno visual añadido"));
  expect(screen.getByRole("button", { name: "Trazo 3" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Vista en camiseta" })); expect(screen.getByLabelText("Vista previa de bordado en camiseta")).toBeTruthy();
});
