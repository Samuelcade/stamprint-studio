// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { installTestCanvas } from "../graphic-editor/testCanvas";
import { ScreenPrinting } from "./ScreenPrinting";
import { separatePixels } from "./separate";

class FakeWorker {
  static instance: FakeWorker;
  onmessage?: (event: { data: unknown }) => void;
  postMessage = vi.fn(); terminate = vi.fn();
  constructor() { FakeWorker.instance = this; }
}
beforeEach(() => { installTestCanvas(); vi.stubGlobal("Worker", FakeWorker); vi.stubGlobal("indexedDB", new IDBFactory()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("separa el diseño, edita tintas y combina colores", async () => {
  const user = userEvent.setup();
  render(<ScreenPrinting hasEditorDesign onUseEditor={async () => ({ source: "data:image/png;base64,AA==", name: "Diseño" })} />);
  await user.click(screen.getByRole("button", { name: "Usar diseño del editor" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Separar colores" })).not.toHaveProperty("disabled", true));
  await user.click(screen.getByRole("button", { name: "Separar colores" }));
  expect(FakeWorker.instance.postMessage).toHaveBeenCalledWith(expect.objectContaining({ colors: 4, removeWhite: false }));
  const result = separatePixels(2, 1, new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), 2, false);
  act(() => FakeWorker.instance.onmessage!({ data: { type: "done", result } }));
  await user.click(screen.getByRole("button", { name: "Tinta seleccionada" }));
  const canvas = screen.getByLabelText("Vista de separación de colores") as HTMLCanvasElement;
  expect(canvas.getContext("2d")!.getImageData(1, 0, 1, 1).data[3]).toBe(0);
  fireEvent.change(screen.getByLabelText("Color de tinta"), { target: { value: "#00ff00" } });
  expect(canvas.getContext("2d")!.getImageData(0, 0, 1, 1).data[1]).toBe(255);
  await user.click(screen.getByRole("button", { name: "Todas las tintas" }));
  await user.click(screen.getByLabelText("Pincel de tinta seleccionada"));
  fireEvent.change(screen.getByRole("slider", { name: /Tamaño del pincel/ }), { target: { value: "2" } });
  await user.selectOptions(screen.getByLabelText("Tipo de pincel"), "square");
  fireEvent.pointerDown(canvas, { clientX: 600, clientY: 500, pointerId: 1 }); fireEvent.pointerUp(canvas, { clientX: 600, clientY: 500, pointerId: 1 });
  expect(canvas.getContext("2d")!.getImageData(1, 0, 1, 1).data[1]).toBe(255);
  await user.selectOptions(screen.getByLabelText("Tipo de pincel"), "eraser");
  fireEvent.pointerDown(canvas, { clientX: 600, clientY: 500, pointerId: 1 }); fireEvent.pointerUp(canvas, { clientX: 600, clientY: 500, pointerId: 1 });
  expect(canvas.getContext("2d")!.getImageData(1, 0, 1, 1).data[3]).toBe(0);
  await user.selectOptions(screen.getByLabelText("Tipo de pincel"), "round");
  fireEvent.pointerDown(canvas, { clientX: 600, clientY: 500, pointerId: 1 }); fireEvent.pointerUp(canvas, { clientX: 600, clientY: 500, pointerId: 1 });
  expect(canvas.getContext("2d")!.getImageData(1, 0, 1, 1).data[1]).toBe(255);
  await user.click(screen.getByRole("button", { name: "Guardar proyecto" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("guardado en este navegador"));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await user.click(screen.getByRole("button", { name: "Descargar PNG" }));
  await waitFor(() => expect(download).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("PNG de tintas visibles descargado"));
  await user.selectOptions(screen.getByLabelText("Combinar con"), "1");
  expect(screen.getByRole("status").textContent).toContain("combinadas");
  expect(screen.queryByRole("button", { name: "Ocultar tinta 2" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Eliminar tinta" }));
  expect(screen.getByText("Las tintas aparecerán aquí después de separar.")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Abrir proyecto guardado" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("recuperado"));
  expect(screen.getByRole("button", { name: "Ocultar tinta 2" })).toBeTruthy();
  expect((screen.getByLabelText("Color de tinta") as HTMLInputElement).value).toBe("#00ff00");
});
