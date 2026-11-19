import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent } from "react";
import { createId } from "../../core/id";
import { pngWithDpi } from "../graphic-editor/png";
import { alphaBounds, croppedDesign } from "./crop";
import type { CropRect } from "./crop";
import { CropDialog } from "./CropDialog";
import { drawBackground, drawDesign } from "./draw";
import { sheetPdf } from "./pdf";
import { angle, arrange, dimensions, layoutIssues, place, rotateDesign } from "./layout";
import type { Design, Sheet } from "./layout";
import { loadSheet, saveSheet } from "./storage";
import { DEFAULT_SETTINGS } from "../settings/settings";
import type { Settings } from "../settings/settings";
import "./gang-sheet.css";

let session: Sheet | undefined;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("No se pudo abrir la imagen")); image.src = source; });

function NumberField({ label, value, min, max, step, onCommit }: { label: string; value: number; min: number; max: number; step: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(+value.toFixed(2)));
  useEffect(() => { setDraft(String(+value.toFixed(2))); }, [value]);
  function commit() {
    const parsed = Number(draft);
    const next = draft.trim() && Number.isFinite(parsed) ? clamp(parsed, min, max) : value;
    onCommit(next); setDraft(String(+next.toFixed(2)));
  }
  return <label>{label}<input type="number" min={min} max={max} step={step} value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}

export function GangSheet({ hasEditorDesign, onUseEditor, onOpenEditor, defaults = DEFAULT_SETTINGS.dtf }: { hasEditorDesign: boolean; onUseEditor: () => Promise<{ source: string; name: string; widthCm: number; heightCm: number }>; onOpenEditor: () => void; defaults?: Settings["dtf"] }) {
  const [sheet, setSheet] = useState<Sheet>(() => session ?? { ...defaults, items: [] });
  const [selectedId, setSelectedId] = useState<string>();
  const [message, setMessage] = useState("Carga diseños o utiliza la composición del editor.");
  const [busy, setBusy] = useState(false);
  const [cropItem, setCropItem] = useState<Design>();
  const board = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const drag = useRef<{ kind: "move" | "resize" | "rotate"; item: Design; startX: number; startY: number; startAngle: number } | null>(null);
  const update = (fn: (previous: Sheet) => Sheet) => setSheet(previous => { const next = fn(previous); session = next; return next; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const selected = sheet.items.find(item => item.id === selectedId);
  const issues = layoutIssues(sheet.items, sheet.width, sheet.height, sheet.gap);
  const usedLength = Math.max(0, ...sheet.items.map(item => item.y + dimensions(item).height));
  const area = sheet.items.reduce((sum, item) => sum + item.width * item.height, 0);
  const setItem = (id: string, changes: Partial<Design>) => update(s => ({ ...s, items: s.items.map(item => item.id === id ? { ...item, ...changes } : item) }));
  function add(source: string, name: string, width: number, height: number) {
    const id = createId();
    const item = { id, source, name, width, height, x: 0, y: 0, rotated: false };
    const positioned = place(item, sheet.items, sheet.width, sheet.height, sheet.gap);
    update(s => ({ ...s, items: [...s.items, place(item, s.items, s.width, s.height, s.gap) ?? item] }));
    setSelectedId(id); setMessage(positioned ? "Diseño añadido en un espacio disponible." : "Diseño añadido; no se encontró espacio libre. Ajusta la hoja o distribuye los diseños.");
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []); event.target.value = "";
    setBusy(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith("image/")) throw new Error(`${file.name}: selecciona una imagen válida.`);
        const source = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("No se pudo leer el archivo")); reader.readAsDataURL(file); });
        const image = await loadImage(source);
        const width = Math.min(20, sheet.width, image.width / 150 * 2.54);
        add(source, file.name, width, width * image.height / image.width);
      }
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function editor() {
    setBusy(true);
    try { const design = await onUseEditor(); add(design.source, design.name, design.widthCm, design.heightCm); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function saveCurrentSheet() {
    if (busy) return; setBusy(true);
    try { await saveSheet(sheet); if (mounted.current) setMessage("Mesa guardada en este navegador. El siguiente guardado reemplazará esta copia."); }
    catch { if (mounted.current) setMessage("No se pudo guardar la mesa. Comprueba el espacio disponible en el navegador."); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function openSavedSheet() {
    if (busy) return; setBusy(true);
    try {
      const saved = await loadSheet(); if (!mounted.current) return;
      if (!saved) { setMessage("Todavía no hay una mesa DTF guardada en este navegador."); return; }
      session = saved; setSheet(saved); setSelectedId(undefined); setMessage("Mesa DTF recuperada con sus diseños y medidas.");
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "No se pudo abrir la mesa guardada."); }
    finally { if (mounted.current) setBusy(false); }
  }
  function applyCrop(item: Design, rect: CropRect, width: number, height: number, source: string) {
    update(s => ({ ...s, items: s.items.map(current => current.id === item.id && current.source === item.source ? croppedDesign(current, rect, width, height, source) : current) }));
    setCropItem(undefined); setMessage("Recorte aplicado. Las medidas corresponden al área conservada y mantienen la escala de impresión.");
  }
  async function autoCrop(item: Design) {
    setBusy(true);
    try {
      const image = await loadImage(item.source), canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) throw new Error("No se pudo analizar la imagen.");
      ctx.drawImage(image, 0, 0);
      const rect = alphaBounds(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      if (!rect) { setMessage("La imagen está completamente transparente y no tiene contenido para recortar."); return; }
      if (rect.width === canvas.width && rect.height === canvas.height) { setMessage("El contenido llega a los bordes: no hay márgenes transparentes que eliminar. Usa Recorte manual si lo necesitas."); return; }
      const cropped = document.createElement("canvas"); cropped.width = rect.width; cropped.height = rect.height;
      const context = cropped.getContext("2d"); if (!context) throw new Error("No se pudo recortar la imagen.");
      context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      applyCrop(item, rect, canvas.width, canvas.height, cropped.toDataURL("image/png"));
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  function autoArrange() {
    const result = arrange(sheet.items, sheet.width, sheet.height, sheet.gap);
    if (!result) { setMessage("Los diseños no caben con estas medidas y separación. Aumenta el largo o reduce los diseños."); return; }
    update(s => ({ ...s, items: result })); setMessage("Diseños distribuidos respetando la separación indicada.");
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !board.current) return;
    const rect = board.current.getBoundingClientRect(), d = drag.current;
    if (!rect.width || !rect.height) return;
    const dx = (event.clientX - d.startX) / rect.width * sheet.width, dy = (event.clientY - d.startY) / rect.height * sheet.height;
    if (d.kind === "move") setItem(d.item.id, { x: Math.max(0, d.item.x + dx), y: Math.max(0, d.item.y + dy) });
    else if (d.kind === "resize") {
      const size = dimensions(d.item), scale = clamp(1 + (dx * size.width + dy * size.height) / (size.width ** 2 + size.height ** 2), Math.max(.1 / d.item.width, .1 / d.item.height), Math.min(300 / d.item.width, 300 / d.item.height));
      setItem(d.item.id, { width: d.item.width * scale, height: d.item.height * scale });
    } else {
      const size = dimensions(d.item), cx = d.item.x + size.width / 2, cy = d.item.y + size.height / 2;
      const x = (event.clientX - rect.left) / rect.width * sheet.width, y = (event.clientY - rect.top) / rect.height * sheet.height;
      const degrees = angle(d.item) + (Math.atan2(y - cy, x - cx) - d.startAngle) * 180 / Math.PI;
      const rotated = rotateDesign(d.item, degrees); setItem(d.item.id, { x: rotated.x, y: rotated.y, rotation: rotated.rotation });
    }
  }
  function startGesture(event: PointerEvent<HTMLElement>, item: Design, kind: "move" | "resize" | "rotate") {
    if (busy || !board.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setSelectedId(item.id);
    const rect = board.current.getBoundingClientRect(), size = dimensions(item);
    const x = (event.clientX - rect.left) / rect.width * sheet.width, y = (event.clientY - rect.top) / rect.height * sheet.height;
    drag.current = { kind, item, startX: event.clientX, startY: event.clientY, startAngle: Math.atan2(y - item.y - size.height / 2, x - item.x - size.width / 2) };
  }
  async function exportSheet(format: "png" | "pdf") {
    const width = Math.round(sheet.width / 2.54 * sheet.dpi), height = Math.round(sheet.height / 2.54 * sheet.dpi);
    if (width > 16000 || height > 16000 || width * height > 64000000) { setMessage("La hoja supera el límite de exportación (16.000 px por lado y 64 megapíxeles). Reduce el largo o los DPI."); return; }
    setBusy(true); setMessage(`Preparando ${format.toUpperCase()} con ${sheet.items.length} diseño(s)…`);
    try {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("No se pudo crear la hoja de impresión.");
      drawBackground(ctx, width, height, sheet.background);
      for (const item of sheet.items) {
        const image = await loadImage(item.source);
        drawDesign(ctx, image, item, sheet.dpi / 2.54);
      }
      let file: Blob;
      if (format === "pdf") file = await sheetPdf(ctx.getImageData(0, 0, width, height), sheet.width, sheet.height);
      else {
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("No se pudo generar el PNG.")), "image/png"));
        const bytes = pngWithDpi(new Uint8Array(await blob.arrayBuffer()), sheet.dpi); file = new Blob([bytes as BlobPart], { type: "image/png" });
      }
      const url = URL.createObjectURL(file);
      const link = document.createElement("a"); link.href = url; link.download = `mesa-dtf.${format}`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`${format.toUpperCase()} preparado: ${width} × ${height} px a ${sheet.dpi} DPI.${issues.outside ? " Aviso: las partes fuera de la hoja se recortaron." : ""}${issues.overlaps ? " Aviso: hay diseños superpuestos o con separación inferior a la indicada; se exportaron tal como se ven." : ""} Elige dónde guardar el archivo si el sistema lo solicita.`);
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <div className="gang-studio">
    <div className="gang-toolbar"><div><p className="eyebrow">PREPARACIÓN DE IMPRESIÓN</p><h1>Mesa DTF <span>/ gang sheet</span></h1></div><div className="gang-actions"><label className="file-action">+ Cargar diseños<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={event => void upload(event)} /></label><button disabled={!hasEditorDesign || busy} onClick={() => void editor()}>Usar diseño del editor</button><button disabled={busy} onClick={onOpenEditor}>Abrir editor</button><button disabled={busy} onClick={() => void openSavedSheet()}>Abrir mesa guardada</button><button disabled={busy || !sheet.items.length} onClick={() => void saveCurrentSheet()}>Guardar mesa</button><button className="accent" disabled={!sheet.items.length || busy} onClick={() => void exportSheet("png")}>Exportar PNG</button><button className="accent" disabled={!sheet.items.length || busy} onClick={() => void exportSheet("pdf")}>Exportar PDF</button></div></div>
    <p className="gang-export-status" aria-live="polite">{issues.outside > 0 ? `${issues.outside} diseño(s) fuera de la hoja. ` : ""}{issues.overlaps > 0 ? `${issues.overlaps} par(es) superpuestos o con separación insuficiente. ` : ""}{message}</p>
    <div className="gang-layout"><div className="gang-panel"><h2>Configuración de hoja</h2><div className="gang-fields"><NumberField label="Ancho del rollo (cm)" min={1} max={100} step="0.1" value={sheet.width} onCommit={width => update(s => ({ ...s, width }))} /><NumberField label="Largo de hoja (cm)" min={1} max={300} step="0.1" value={sheet.height} onCommit={height => update(s => ({ ...s, height }))} /><NumberField label="Separación (cm)" min={0} max={10} step="0.1" value={sheet.gap} onCommit={gap => update(s => ({ ...s, gap }))} /><NumberField label="Resolución (DPI)" min={72} max={600} step="1" value={sheet.dpi} onCommit={dpi => update(s => ({ ...s, dpi: Math.round(dpi) }))} /></div><button className="gang-wide" disabled={!sheet.items.length} onClick={autoArrange}>✦ Distribuir automáticamente</button><p className="gang-help">La distribución respeta la orientación actual de cada diseño y el largo de hoja configurado.</p><hr /><h2>Resumen de impresión</h2><div className="gang-stat"><span>Diseños</span><b>{sheet.items.length}</b></div><div className="gang-stat"><span>Longitud ocupada</span><b>{usedLength.toFixed(1)} cm</b></div><div className="gang-stat"><span>Película de la hoja</span><b>{sheet.height.toFixed(1)} cm</b></div><div className="gang-stat"><span>Área de diseños*</span><b>{(area / (sheet.width * sheet.height) * 100).toFixed(1)} %</b></div><p className="gang-help">*Calculada con los rectángulos de los diseños, no con sus píxeles impresos.</p></div>
    <div className="gang-workspace"><div className="gang-ruler">{sheet.width} cm de ancho <span>↓ {sheet.height} cm de largo</span></div><div className="gang-background"><label>Fondo de la hoja <select value={sheet.background} onChange={event => update(s => ({ ...s, background: event.target.value as Sheet["background"] }))}><option value="transparent">Transparente</option><option value="white">Blanco</option></select></label><span>Se aplica a la vista y a las descargas.</span><button disabled={busy} onClick={() => { update(s => ({ ...s, ...defaults })); setMessage("Valores predeterminados aplicados. Revisa la posición y separación de tus diseños."); }}>Aplicar valores DTF predeterminados</button></div><div className="gang-scroll"><div className={`gang-board ${sheet.background === "white" ? "gang-board-white" : ""}`} ref={board} style={{ aspectRatio: `${sheet.width} / ${sheet.height}` }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onClick={event => { if (event.target === event.currentTarget) setSelectedId(undefined); }}>
      {!sheet.items.length && <div className="gang-empty">Tu película está lista<br /><small>Añade diseños para empezar</small></div>}
      {sheet.items.map(item => { const size = dimensions(item); return <div key={item.id} className={`gang-item ${selectedId === item.id ? "selected" : ""}`} title={item.name} style={{ left: `${item.x / sheet.width * 100}%`, top: `${item.y / sheet.height * 100}%`, width: `${size.width / sheet.width * 100}%`, height: `${size.height / sheet.height * 100}%` }} onPointerDown={event => startGesture(event, item, "move")}><img draggable={false} src={item.source} alt={item.name} style={{ width: `${item.width / size.width * 100}%`, height: `${item.height / size.height * 100}%`, transform: `translate(-50%, -50%) rotate(${angle(item)}deg)` }} />{selectedId === item.id && <><button className="gang-handle gang-handle-rotate" aria-label="Girar diseño arrastrando" title="Arrastra para girar" onPointerDown={event => startGesture(event, item, "rotate")}>↻</button><button className="gang-handle gang-handle-resize" aria-label="Cambiar tamaño arrastrando" title="Arrastra para cambiar el tamaño" onPointerDown={event => startGesture(event, item, "resize")}>↘</button></>}</div>; })}
    </div></div><p className="gang-status" role="status">{issues.outside > 0 ? `${issues.outside} diseño(s) fuera de la hoja. ` : ""}{issues.overlaps > 0 ? `${issues.overlaps} par(es) superpuestos o con separación insuficiente. ` : ""}{message}</p></div>
    <div className="gang-panel"><h2>Diseños en la hoja</h2>{sheet.items.length === 0 ? <p className="gang-help">Aún no hay diseños.</p> : <div className="gang-list">{sheet.items.map((item, index) => <button key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)}><img src={item.source} alt="" /><span>{item.name}<small>#{index + 1} · {dimensions(item).width.toFixed(1)} × {dimensions(item).height.toFixed(1)} cm</small></span></button>)}</div>}
    {selected && <><hr /><h2>Diseño seleccionado</h2><div className="gang-fields" key={selected.id}><NumberField label="Ancho (cm)" min={0.1} max={300} step="0.1" value={selected.width} onCommit={width => setItem(selected.id, { width, height: selected.height * width / selected.width })} /><NumberField label="Alto (cm)" min={0.1} max={300} step="0.1" value={selected.height} onCommit={height => setItem(selected.id, { height, width: selected.width * height / selected.height })} /><NumberField label="Posición X (cm)" min={0} max={300} step="0.1" value={selected.x} onCommit={x => setItem(selected.id, { x })} /><NumberField label="Posición Y (cm)" min={0} max={300} step="0.1" value={selected.y} onCommit={y => setItem(selected.id, { y })} /><NumberField label="Giro (°)" min={0} max={360} step="1" value={angle(selected)} onCommit={degrees => { const rotated = rotateDesign(selected, degrees); setItem(selected.id, { x: rotated.x, y: rotated.y, rotation: rotated.rotation }); }} /></div><p className="gang-help">Arrastra la esquina para cambiar el tamaño o el control ↻ para girar. El ancho y el alto conservan la proporción original.</p><div className="gang-item-actions"><button onClick={() => { const rotated = rotateDesign(selected, angle(selected) + 90); setItem(selected.id, { x: rotated.x, y: rotated.y, rotation: rotated.rotation }); }}>↻ Girar 90°</button><button onClick={() => { const copy = { ...selected, id: createId() }; const position = place(copy, sheet.items, sheet.width, sheet.height, sheet.gap); update(s => ({ ...s, items: [...s.items, position ?? { ...copy, x: selected.x + 1, y: selected.y + 1 }] })); setSelectedId(copy.id); setMessage(position ? "Diseño duplicado en un espacio disponible." : "Diseño duplicado; ajusta la hoja o distribuye los diseños para evitar superposiciones."); }}>Duplicar</button><button onClick={() => { update(s => ({ ...s, items: s.items.filter(item => item.id !== selected.id) })); setSelectedId(undefined); setMessage("Diseño eliminado."); }}>Eliminar</button></div><hr /><h2>Recortar márgenes</h2><div className="gang-crop-actions"><button disabled={busy} onClick={() => void autoCrop(selected)}>✦ Recorte automático</button><button disabled={busy} onClick={() => setCropItem(selected)}>Recorte manual</button></div><p className="gang-help">El automático elimina solo márgenes transparentes. Después puedes ajustar las medidas del diseño recortado.</p></>}
    </div></div>{cropItem && <CropDialog item={cropItem} onCancel={() => setCropItem(undefined)} onApply={(rect, width, height, source) => applyCrop(cropItem, rect, width, height, source)} />}</div>;
}
