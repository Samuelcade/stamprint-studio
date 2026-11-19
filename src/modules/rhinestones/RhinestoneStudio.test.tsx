// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { installTestCanvas, testImage } from "../graphic-editor/testCanvas";
import { RhinestoneStudio } from "./RhinestoneStudio";

beforeEach(() => { installTestCanvas(); vi.stubGlobal("indexedDB", new IDBFactory()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("coloca y selecciona piedras, guarda, recupera y muestra una vista en camiseta", async () => {
  const user = userEvent.setup();
  render(<RhinestoneStudio hasEditorDesign={false} onUseEditor={async () => ({ source: "", name: "" })} />);
  const board = screen.getByLabelText("Lienzo de piedrería");
  await user.click(screen.getByRole("button", { name: "Pincel" }));
  fireEvent.pointerDown(board, { button: 0, clientX: 400, clientY: 400 }); fireEvent.pointerUp(board, { button: 0, clientX: 400, clientY: 400 });
  expect(board.querySelectorAll("circle[data-stone]")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Seleccionar todas" }));
  fireEvent.change(screen.getByLabelText("Color de piedra"), { target: { value: "#ed1234" } });
  expect(board.querySelector("circle[data-stone]")!.getAttribute("fill")).toBe("#ed1234");
  await user.click(screen.getByRole("button", { name: "Guardar proyecto" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("guardado en este navegador"));
  await user.click(screen.getByRole("button", { name: "Seleccionar todas" }));
  await user.click(screen.getByRole("button", { name: "Eliminar selección" })); expect(board.querySelectorAll("circle[data-stone]")).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Abrir proyecto guardado" }));
  await waitFor(() => expect(board.querySelectorAll("circle[data-stone]")).toHaveLength(1));
  expect(board.querySelector("circle[data-stone]")!.getAttribute("fill")).toBe("#ed1234");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await user.click(screen.getByRole("button", { name: "Plantilla SVG" }));
  expect(click).toHaveBeenCalledOnce(); expect(screen.getByRole("status").textContent).toContain("SVG descargada a escala");
  let output: Blob | undefined;
  vi.mocked(URL.createObjectURL).mockImplementation(blob => { output = blob as Blob; return "blob:png"; });
  await user.click(screen.getByRole("button", { name: "Descargar PNG" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("fondo blanco"));
  const image = await loadImage(new Uint8Array(await output!.arrayBuffer()));
  const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
  expect([...ctx.getImageData(0, 0, 1, 1).data]).toEqual([255, 255, 255, 255]);
  const stone = board.querySelector("circle[data-stone]")!;
  const x = Math.round(Number(stone.getAttribute("cx")) / 2.54 * 150), y = Math.round(Number(stone.getAttribute("cy")) / 2.54 * 150);
  expect(ctx.getImageData(x, y, 1, 1).data[3]).toBe(255);
  expect([...ctx.getImageData(x, y, 1, 1).data]).toEqual([237, 18, 52, 255]);
  await user.selectOptions(screen.getByLabelText("Fondo del PNG"), "transparent");
  await user.click(screen.getByRole("button", { name: "Descargar PNG" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("fondo transparente"));
  const transparent = await loadImage(new Uint8Array(await output!.arrayBuffer()));
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(transparent, 0, 0);
  expect(ctx.getImageData(0, 0, 1, 1).data[3]).toBe(0);
  await user.click(screen.getByRole("button", { name: "Vista en camiseta" }));
  expect(screen.getByLabelText("Vista previa en camiseta").querySelectorAll("circle")).toHaveLength(1);
  expect(screen.getByLabelText("Vista previa en camiseta").querySelector("circle")!.getAttribute("fill")).toBe("#ed1234");
});

it("cambia solo el color de la selección y permite aplicarlo a todas sin alterar tamaños ni posiciones", async () => {
  const user = userEvent.setup();
  render(<RhinestoneStudio hasEditorDesign={false} onUseEditor={async () => ({ source: "", name: "" })} />);
  const all = screen.getByRole("button", { name: "Seleccionar todas" });
  if (!(all as HTMLButtonElement).disabled) { await user.click(all); await user.click(screen.getByRole("button", { name: "Eliminar selección" })); }
  const board = screen.getByLabelText("Lienzo de piedrería");
  await user.click(screen.getByRole("button", { name: "Pincel" }));
  for (const x of [200, 600]) {
    fireEvent.pointerDown(board, { button: 0, clientX: x, clientY: 400 });
    fireEvent.pointerUp(board, { button: 0, clientX: x, clientY: 400 });
  }
  const stones = [...board.querySelectorAll("circle[data-stone]")];
  expect(stones).toHaveLength(2);
  const geometry = () => stones.map(stone => ["cx", "cy", "r"].map(key => stone.getAttribute(key)));
  const before = geometry(), originalSecondColor = stones[1].getAttribute("fill");
  await user.click(screen.getByRole("button", { name: "Seleccionar" }));
  fireEvent.pointerDown(stones[0], { button: 0, clientX: 200, clientY: 400 });
  fireEvent.pointerUp(board, { button: 0, clientX: 200, clientY: 400 });
  await user.click(screen.getByRole("button", { name: "Color Azul" }));
  expect(stones[0].getAttribute("fill")).toBe("#2563eb");
  expect(stones[1].getAttribute("fill")).toBe(originalSecondColor);
  await user.click(screen.getByRole("button", { name: "Aplicar color a todas" }));
  expect(stones.map(stone => stone.getAttribute("fill"))).toEqual(["#2563eb", "#2563eb"]);
  expect(geometry()).toEqual(before);
});

it("crea una propuesta al cargar una imagen en una hoja vacía y conserva piedras existentes", async () => {
  const user = userEvent.setup();
  render(<RhinestoneStudio hasEditorDesign onUseEditor={async () => ({ source: testImage(), name: "Imagen" })} />);
  const all = screen.getByRole("button", { name: "Seleccionar todas" });
  if (!(all as HTMLButtonElement).disabled) { await user.click(all); await user.click(screen.getByRole("button", { name: "Eliminar selección" })); }
  for (const label of ["Ancho (cm)", "Alto (cm)"]) { const field = screen.getByLabelText(label); await user.clear(field); await user.type(field, "5"); fireEvent.blur(field); }
  await user.click(screen.getByRole("button", { name: "Usar diseño del editor" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Diseño creado automáticamente"));
  const board = screen.getByLabelText("Lienzo de piedrería"), count = board.querySelectorAll("circle[data-stone]").length;
  expect(count).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Usar diseño del editor" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Se conservaron tus piedras"));
  expect(board.querySelectorAll("circle[data-stone]")).toHaveLength(count);
});
