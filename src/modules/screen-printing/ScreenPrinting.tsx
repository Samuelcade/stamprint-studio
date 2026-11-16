import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent } from "react";
import { importImageFile } from "../graphic-editor/render";
import { recolorLabels, renderSeparation } from "./separate";
import type { Separation } from "./separate";
import { loadScreenProject, saveScreenProject } from "./storage";
import "./screen-printing.css";

type Input = { source: string; name: string };
let saved: { input?: Input; result?: Separation; selected?: number } = {};

export function ScreenPrinting({ hasEditorDesign, onUseEditor }: { hasEditorDesign: boolean; onUseEditor: () => Promise<Input> }) {
  const [input, setInput] = useState<Input | undefined>(saved.input), [result, setResult] = useState<Separation | undefined>(saved.result);
  const [selected, setSelected] = useState<number | undefined>(saved.selected), [colors, setColors] = useState(4), [removeWhite, setRemoveWhite] = useState(false);
  const [view, setView] = useState<"all" | "single" | "original">("all"), [brush, setBrush] = useState(false), [brushSize, setBrushSize] = useState(20);
  const [brushType, setBrushType] = useState<"round" | "square" | "eraser">("round");
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("Carga un diseño para separar sus colores."), [error, setError] = useState("");
  const worker = useRef<Worker | null>(null), version = useRef(0), mounted = useRef(true), canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ draft: Separation; last?: { x: number; y: number } } | null>(null);
  const ink = result?.inks.find(item => item.id === selected);
  useEffect(() => { saved = { input, result, selected }; }, [input, result, selected]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; version.current++; worker.current?.terminate(); }; }, []);
  function draw(data: Separation, mode = view, current = selected) {
    const target = canvas.current; if (!target) return;
    target.width = data.width; target.height = data.height;
    const ctx = target.getContext("2d"); if (!ctx) return;
    const pixels = renderSeparation(data, mode === "single" ? current ?? null : null);
    const image = ctx.createImageData(data.width, data.height); image.data.set(pixels); ctx.putImageData(image, 0, 0);
  }
  useEffect(() => { if (result && view !== "original") draw(result); }, [result, view, selected]);
  async function load(get: () => Promise<Input>) {
    setBusy(true); setError("");
    try { const next = await get(); if (!mounted.current) return; setInput(next); setResult(undefined); setSelected(undefined); setView("original"); setBrush(false); setStatus("Diseño cargado. Elige la cantidad de tintas y pulsa Separar colores."); }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "No se pudo abrir la imagen."); }
    finally { if (mounted.current) setBusy(false); }
  }
  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    void load(async () => ({ ...(await importImageFile(file)), name: file.name }));
  }
  function cancel() { version.current++; worker.current?.terminate(); worker.current = null; setBusy(false); setStatus("Separación cancelada. Se conserva el resultado anterior."); }
  function separate() {
    if (!input || busy) return;
    const id = ++version.current; setError(""); setBusy(true); setStatus("Analizando colores y preparando tintas…");
    try {
      const task = new Worker(new URL("./separate.worker.ts", import.meta.url), { type: "module" }); worker.current = task;
      task.onmessage = event => {
        if (!mounted.current || version.current !== id) return;
        if (event.data.type === "done") { const next = event.data.result as Separation; setResult(next); setSelected(next.inks[0]?.id); setView("all"); setBrush(false); setStatus(`Separación lista: ${next.inks.length} tintas · ${next.width} × ${next.height} px de análisis.`); }
        else { setError(event.data.message || "No se pudo separar el diseño."); setStatus("No se completó la separación."); }
        task.terminate(); worker.current = null; setBusy(false);
      };
      task.onerror = event => { event.preventDefault(); if (mounted.current && version.current === id) { task.terminate(); worker.current = null; setBusy(false); setError("No se pudo separar el diseño. Prueba otra imagen o menos tintas."); } };
      task.postMessage({ source: input.source, colors, removeWhite });
    } catch (failure) { setBusy(false); setError(failure instanceof Error ? failure.message : "No se pudo iniciar la separación."); }
  }
  function updateInk(id: number, change: Partial<Separation["inks"][number]>) { setResult(current => current && ({ ...current, inks: current.inks.map(item => item.id === id ? { ...item, ...change } : item) })); }
  function merge(target: number) {
    if (!result || selected === undefined || target === selected) return;
    setResult({ ...result, labels: recolorLabels(result.labels, selected, target), inks: result.inks.filter(item => item.id !== selected) }); setSelected(target); setStatus("Tintas combinadas.");
  }
  function removeInk() {
    if (!result || selected === undefined) return;
    const inks = result.inks.filter(item => item.id !== selected);
    setResult({ ...result, labels: recolorLabels(result.labels, selected, 255), inks }); setSelected(inks[0]?.id); setBrush(false); setStatus("Tinta eliminada; sus zonas quedan transparentes.");
  }
  async function saveProject() {
    if (!input || !result || busy) return;
    setBusy(true); setError("");
    try { await saveScreenProject({ input, result, selected, colors, removeWhite }); if (mounted.current) setStatus("Proyecto de serigrafía guardado en este navegador. Puedes recuperarlo con Abrir proyecto guardado."); }
    catch { if (mounted.current) setError("No se pudo guardar el proyecto en este navegador."); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function openProject() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const project = await loadScreenProject(); if (!mounted.current) return;
      if (!project) { setStatus("Todavía no hay un proyecto de serigrafía guardado en este navegador."); return; }
      setInput(project.input); setResult(project.result); setSelected(project.selected); setColors(project.colors); setRemoveWhite(project.removeWhite); setView("all"); setBrush(false);
      setStatus("Proyecto guardado recuperado con sus tintas y ediciones.");
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "No se pudo abrir el proyecto guardado."); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function downloadPng() {
    if (!input || !result || busy) return;
    if (!result.inks.some(item => item.visible)) { setError("Activa al menos una tinta para descargar la imagen."); return; }
    setBusy(true); setError("");
    try {
      const output = document.createElement("canvas"); output.width = result.width; output.height = result.height;
      const ctx = output.getContext("2d"); if (!ctx) throw new Error("No se pudo crear la imagen.");
      const image = ctx.createImageData(result.width, result.height); image.data.set(renderSeparation(result, null)); ctx.putImageData(image, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error("No se pudo generar el PNG.")), "image/png"));
      const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `${input.name.replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*]/g, "_") || "serigrafia"}-tintas.png`; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (mounted.current) setStatus(`PNG de tintas visibles descargado: ${result.width} × ${result.height} px.`);
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "No se pudo descargar el PNG."); }
    finally { if (mounted.current) setBusy(false); }
  }
  function paint(event: PointerEvent<HTMLCanvasElement>, start: boolean) {
    if (!result || !brush || selected === undefined || !ink?.visible || busy) return;
    if (start) { event.currentTarget.setPointerCapture(event.pointerId); drawing.current = { draft: { ...result, labels: result.labels.slice() } }; }
    if (!drawing.current) return;
    const bounds = event.currentTarget.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
    const x = (event.clientX - bounds.left) / bounds.width * result.width, y = (event.clientY - bounds.top) / bounds.height * result.height;
    const draft = drawing.current.draft, previous = drawing.current.last ?? { x, y }, radius = brushSize / 2, steps = Math.max(1, Math.ceil(Math.hypot(x - previous.x, y - previous.y) / Math.max(1, radius / 2)));
    for (let step = 0; step <= steps; step++) {
      const cx = previous.x + (x - previous.x) * step / steps, cy = previous.y + (y - previous.y) * step / steps;
      for (let py = Math.max(0, Math.floor(cy - radius)); py <= Math.min(draft.height - 1, Math.ceil(cy + radius)); py++) for (let px = Math.max(0, Math.floor(cx - radius)); px <= Math.min(draft.width - 1, Math.ceil(cx + radius)); px++) {
        const p = py * draft.width + px;
        const inside = brushType === "square" ? Math.abs(px - cx) <= radius && Math.abs(py - cy) <= radius : (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2;
        if (draft.alpha[p] && inside) draft.labels[p] = brushType === "eraser" ? 255 : selected;
      }
    }
    drawing.current.last = { x, y }; draw(draft);
  }
  function finishPaint(commit: boolean) { if (!drawing.current) return; if (commit) { setResult(drawing.current.draft); setStatus(brushType === "eraser" ? "Zonas retiradas de las tintas." : "Zonas asignadas a la tinta seleccionada."); } else if (result) draw(result); drawing.current = null; }
  return <div className="screen-studio"><div className="screen-heading"><div><p className="eyebrow">PREPARACIÓN DE SERIGRAFÍA</p><h1>Separación de colores</h1><p>Identifica y organiza las tintas de tu diseño.</p></div><div className="screen-actions"><label className="screen-upload">Cargar diseño<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={upload} /></label><button disabled={!hasEditorDesign || busy} onClick={() => void load(onUseEditor)}>Usar diseño del editor</button><button disabled={busy} onClick={() => void openProject()}>Abrir proyecto guardado</button><button disabled={!result || busy} onClick={() => void saveProject()}>Guardar proyecto</button><button className="accent" disabled={!result || busy} onClick={() => void downloadPng()}>Descargar PNG</button></div></div>
    <div className="screen-layout"><div className="screen-panel"><h2>Preparar separación</h2><p className="screen-help">{input ? input.name : "Aún no hay diseño cargado."}</p><label>Cantidad de tintas <b>{colors}</b><input type="range" aria-label="Cantidad de tintas" min="2" max="12" value={colors} disabled={busy} onChange={event => setColors(Number(event.target.value))} /></label><label className="screen-check"><input type="checkbox" checked={removeWhite} disabled={busy} onChange={event => setRemoveWhite(event.target.checked)} /> Quitar fondo blanco</label><p className="screen-help">Quita todos los píxeles casi blancos, incluso los que estén dentro del diseño.</p>{worker.current ? <button onClick={cancel}>Cancelar separación</button> : <button className="accent screen-wide" disabled={!input || busy} onClick={separate}>{result ? "Volver a separar" : "Separar colores"}</button>}<p className="screen-help">Al volver a separar se reemplazan las ediciones. El análisis usa hasta 1600 px en el lado mayor.</p><hr /><h2>Editar zonas</h2><label className="screen-check"><input type="checkbox" checked={brush} disabled={!ink || busy || !ink.visible} onChange={event => { setBrush(event.target.checked); if (event.target.checked && view === "original") setView("all"); }} /> Pincel de tinta seleccionada</label><label>Tipo de pincel<select value={brushType} disabled={!brush || busy} onChange={event => setBrushType(event.target.value as typeof brushType)}><option value="round">Pincel redondo</option><option value="square">Pincel cuadrado</option><option value="eraser">Borrador redondo</option></select></label><label>Tamaño del pincel <b>{brushSize} px</b><input type="range" min="2" max="100" value={brushSize} disabled={!brush || busy} onChange={event => setBrushSize(Number(event.target.value))} /></label><p className="screen-help">Los pinceles asignan zonas a la tinta seleccionada. El borrador retira la tinta; puedes recuperarla pintando de nuevo. No se pinta sobre el fondo transparente original.</p></div>
    <div className="screen-center"><div className="screen-tabs"><button aria-pressed={view === "original"} disabled={!input} onClick={() => setView("original")}>Original</button><button aria-pressed={view === "all"} disabled={!result} onClick={() => setView("all")}>Todas las tintas</button><button aria-pressed={view === "single"} disabled={!ink} onClick={() => setView("single")}>Tinta seleccionada</button></div><div className="screen-preview">{!input ? <div className="screen-empty">Carga un diseño para comenzar.</div> : view === "original" || !result ? <img src={input.source} alt="Diseño original" /> : <canvas ref={canvas} aria-label="Vista de separación de colores" className={brush ? "painting" : ""} onPointerDown={event => paint(event, true)} onPointerMove={event => paint(event, false)} onPointerUp={() => finishPaint(true)} onPointerCancel={() => finishPaint(false)} onLostPointerCapture={() => finishPaint(true)} />}</div><p className="screen-status" role="status">{status}</p>{error && <p className="screen-error" role="alert">{error}</p>}</div>
    <div className="screen-panel"><fieldset disabled={busy}><h2>Tintas detectadas</h2>{!result?.inks.length ? <p className="screen-help">Las tintas aparecerán aquí después de separar.</p> : <div className="screen-inks">{result.inks.map((item, index) => <div key={item.id} className={selected === item.id ? "active" : ""}><button className="screen-ink-select" aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setBrush(false); }}><span style={{ backgroundColor: item.color }} />Tinta {index + 1}<small>{item.color.toUpperCase()}</small></button><button aria-label={`${item.visible ? "Ocultar" : "Mostrar"} tinta ${index + 1}`} onClick={() => { updateInk(item.id, { visible: !item.visible }); if (selected === item.id && item.visible) setBrush(false); }}>{item.visible ? "◉" : "○"}</button></div>)}</div>}
    {ink && result && <><hr /><h2>Tinta seleccionada</h2><label>Color de tinta<input type="color" value={ink.color} onChange={event => updateInk(ink.id, { color: event.target.value })} /></label><label>Combinar con<select value="" onChange={event => { if (event.target.value !== "") merge(Number(event.target.value)); }}><option value="">Elegir otra tinta…</option>{result.inks.filter(item => item.id !== ink.id).map(item => <option key={item.id} value={item.id}>Tinta {result.inks.indexOf(item) + 1} · {item.color.toUpperCase()}</option>)}</select></label><button className="screen-wide" onClick={removeInk}>Eliminar tinta</button><p className="screen-help">Al combinar, las zonas pasan a la tinta elegida. Al eliminar, esas zonas quedan transparentes.</p></>}<hr /><h2>Guardar y descargar</h2><p className="screen-help">Guardar proyecto conserva una copia editable en este navegador; el siguiente guardado la reemplaza. El PNG incluye las tintas visibles a la resolución de análisis.</p></fieldset></div></div></div>;
}
