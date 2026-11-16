import { useCanvasView } from "../../components/useCanvasView";
import { ViewControls } from "../../components/ViewControls";
import { ChangeEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { DesignLayer, Project, RasterLayer, RemovalMode, TextLayer, Tool } from "../../core/types";
import { createId } from "../../core/id";
import { removeColor, restoreCircle } from "../background-removal/colorRemoval";
import { defaultEffects, hitLayer, toLocalPoint } from "./model";
import { importImageFile, loadImage, makeCanvas, measureTextLayer, ProjectRenderer, replaceLayer } from "./render";
import { EditorProperties } from "./EditorProperties";
import "./editor.css";

export type CommitProject = (next: Project | ((previous: Project) => Project), group?: string) => void;
interface Props { project: Project; section: string; renderer: ProjectRenderer; commit: CommitProject; endGroup: () => void; notice: (message: string) => void; status: string; onPreview: () => void; onNew: () => void; busy: boolean; defaultBackground?: "transparent" | "light" | "dark" }
type Point = { x: number; y: number };
type Gesture = { mode: "move" | "resize" | "rotate"; layer: DesignLayer; start: Point; angle: number; distance: number };

export function GraphicEditor({ project, section, renderer, commit, endGroup, notice, status, onPreview, onNew, busy, defaultBackground = "transparent" }: Props) {
  const [selectedId, setSelectedId] = useState<string | undefined>(() => project.layers.at(-1)?.id);
  const [tool, setTool] = useState<Tool>("select"), [mode, setMode] = useState<RemovalMode>("connected");
  const [tolerance, setTolerance] = useState(32), [brush, setBrush] = useState(24);
  const [working, setWorking] = useState(false);
  const [mobilePanel, setMobilePanel] = useState("canvas");
  const [focusView, setFocusView] = useState(false);
  const [viewBackground, setViewBackground] = useState<string>(defaultBackground);
  const [originalHalftone, setOriginalHalftone] = useState(false), [rendering, setRendering] = useState(false);
  const [draft, setDraft] = useState<DesignLayer>();
  const board = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<DesignLayer | undefined>(undefined), gesture = useRef<Gesture | undefined>(undefined);
  const pending = useRef<Point | undefined>(undefined), frame = useRef(0), alive = useRef(true);
  const active = project.layers.find(layer => layer.id === selectedId);
  const layer = draft ?? active;
  const displayProject = useMemo(() => {
    const display = draft ? replaceLayer(project, draft) : project;
    return originalHalftone && layer?.kind === "image" ? replaceLayer(display, { ...layer, effects: { ...layer.effects, halftone: false } }) : display;
  }, [project, draft, originalHalftone, layer]);
  const view = useCanvasView(project.width, project.height, cancel);
  const { scale } = view;

  useEffect(() => { alive.current = true; return () => { alive.current = false; cancelAnimationFrame(frame.current); }; }, []);
  useEffect(() => { setTool("select"); }, [section]);
  useEffect(() => { setOriginalHalftone(false); }, [section, selectedId]);
  // Undo, document changes or layer edits invalidate the starting geometry.
  useEffect(() => { cancel(); }, [project]);
  useEffect(() => {
    let cancelled = false; setRendering(true);
    const preparation = draft ? (originalHalftone && active?.kind === "image" ? replaceLayer(project, { ...active, effects: { ...active.effects, halftone: false } }) : project) : displayProject;
    renderer.prepare(preparation).then(prepared => { if (!cancelled && canvas.current) renderer.paint(displayProject, canvas.current, prepared); }).catch(error => { if (!cancelled) notice((error as Error).message); }).finally(() => { if (!cancelled) setRendering(false); });
    return () => { cancelled = true; };
  }, [displayProject, project, renderer, notice]);

  const updateLayer = (next: DesignLayer, group?: string) => commit(previous => replaceLayer(previous, next), group);
  function applyQuality(original: RasterLayer, improved: RasterLayer) {
    endGroup();
    commit(previous => {
      const current = previous.layers.find(item => item.id === original.id);
      if (current?.kind !== "image" || current.locked || current.source !== original.source || current.mask !== original.mask) return previous;
      return replaceLayer(previous, { ...current, source: improved.source, mask: improved.mask, pixelWidth: improved.pixelWidth, pixelHeight: improved.pixelHeight });
    });
    notice(`Mejora aplicada: ${improved.pixelWidth} × ${improved.pixelHeight} px. Puedes deshacer.`);
  }
  function duplicate() {
    if (!active || active.locked) return;
    const copy = { ...active, id: createId(), name: `${active.name} (copia)`, x: active.x + project.dpi / 5, y: active.y + project.dpi / 5 };
    commit(previous => ({ ...previous, layers: [...previous.layers, copy] })); setSelectedId(copy.id);
  }
  function remove() {
    if (!active || active.locked) return;
    commit(previous => ({ ...previous, layers: previous.layers.filter(item => item.id !== active.id) })); setSelectedId(undefined);
  }
  function reorder(direction: number) {
    if (!active || active.locked) return;
    commit(previous => { const layers = [...previous.layers], index = layers.findIndex(item => item.id === active.id), target = index + direction;
      if (index < 0 || target < 0 || target >= layers.length) return previous;
      [layers[index], layers[target]] = [layers[target], layers[index]]; return { ...previous, layers };
    });
  }

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]; event.target.value = ""; if (!files.length) return;
    setWorking(true);
    try {
      const images = await Promise.all(files.map(async file => ({ ...await importImageFile(file), name: file.name, id: createId() })));
      if (!alive.current) return;
      commit(previous => previous.id !== project.id ? previous : ({ ...previous, layers: [...previous.layers, ...images.map(image => {
        const factor = Math.min(previous.width * .8 / image.width, previous.height * .8 / image.height, 1);
        return { kind: "image" as const, id: image.id, name: image.name, source: image.source, pixelWidth: image.width, pixelHeight: image.height,
          x: previous.width / 2, y: previous.height / 2, width: image.width * factor, height: image.height * factor, rotation: 0,
          mask: "", visible: true, locked: false, opacity: 1, effects: { ...defaultEffects } };
      })] }));
      setMobilePanel("canvas"); setSelectedId(images.at(-1)!.id); setTool("select"); notice(`${images.length} imagen${images.length === 1 ? " agregada" : "es agregadas"} como capas`);
    } catch (error) { notice((error as Error).message); } finally { if (alive.current) setWorking(false); }
  }
  function addText() {
    const text: TextLayer = measureTextLayer({ kind: "text", id: createId(), name: "Texto", text: "TU DISEÑO", fontFamily: "Arial", bold: true, italic: false, color: "#17191d", align: "center",
      x: project.width / 2, y: project.height / 2, width: 600, height: project.dpi * .65, rotation: 0, opacity: 1, visible: true, locked: false, effects: { ...defaultEffects } });
    commit(previous => ({ ...previous, layers: [...previous.layers, text] })); setMobilePanel("canvas"); setSelectedId(text.id); setTool("select");
  }
  function point(event: { clientX: number; clientY: number }): Point {
    const rect = board.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * project.width, y: (event.clientY - rect.top) / rect.height * project.height };
  }

  async function editMask(target: RasterLayer, location: Point) {
    if (working || target.locked) return;
    const local = toLocalPoint(target, location);
    const u = (local.x * (target.effects.mirror ? -1 : 1)) / target.width + .5, v = local.y / target.height + .5;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return;
    setWorking(true);
    try {
      const w = target.pixelWidth, h = target.pixelHeight;
      const [original, maskImage] = await Promise.all([loadImage(target.source), target.mask ? loadImage(target.mask) : undefined]);
      const source = makeCanvas(w, h), ctx = source.getContext("2d")!; ctx.drawImage(original, 0, 0, w, h);
      const image = ctx.getImageData(0, 0, w, h);
      let previousMask: Uint8ClampedArray | undefined;
      if (maskImage) {
        ctx.clearRect(0, 0, w, h); ctx.drawImage(maskImage, 0, 0, w, h);
        const pixels = ctx.getImageData(0, 0, w, h).data; previousMask = new Uint8ClampedArray(w * h);
        for (let i = 0; i < previousMask.length; i++) previousMask[i] = pixels[i * 4 + 3];
      }
      const hit = { x: Math.floor(u * w), y: Math.floor(v * h) };
      const result = tool === "remove" ? removeColor(image, hit, tolerance, mode, previousMask) : restoreCircle(previousMask ?? new Uint8ClampedArray(w * h).fill(255), w, hit, Math.round(brush / 2));
      const rgba = new ImageData(w, h);
      for (let i = 0; i < result.length; i++) { rgba.data[i * 4] = rgba.data[i * 4 + 1] = rgba.data[i * 4 + 2] = 255; rgba.data[i * 4 + 3] = result[i]; }
      ctx.putImageData(rgba, 0, 0); const mask = source.toDataURL("image/png");
      if (!alive.current) return;
      commit(previous => { const current = previous.layers.find(item => item.id === target.id); return previous === project && current?.kind === "image" && !current.locked && current.source === target.source && current.mask === target.mask ? replaceLayer(previous, { ...current, mask }) : previous; });
      notice(tool === "remove" ? "Color eliminado en la capa seleccionada" : "Zona restaurada en la capa seleccionada");
    } catch (error) { notice((error as Error).message); } finally { if (alive.current) setWorking(false); }
  }

  function start(event: ReactPointerEvent<Element>, mode: Gesture["mode"], target = active) {
    if (!target || target.locked || event.button !== 0 || working) return;
    event.preventDefault(); event.stopPropagation(); endGroup();
    const start = point(event), dx = start.x - target.x, dy = start.y - target.y;
    gesture.current = { mode, layer: target, start, distance: Math.max(1, Math.hypot(dx, dy)), angle: Math.atan2(dy, dx) };
    draftRef.current = target; setDraft(target); event.currentTarget.setPointerCapture(event.pointerId);
  }
  function transform(location: Point) {
    const current = gesture.current; if (!current) return;
    const original = current.layer, dx = location.x - original.x, dy = location.y - original.y;
    let next: DesignLayer;
    if (current.mode === "move") next = { ...original, x: original.x + location.x - current.start.x, y: original.y + location.y - current.start.y };
    else if (current.mode === "resize") {
      const factor = Math.max(10 / Math.min(original.width, original.height), Math.min(10, Math.hypot(dx, dy) / current.distance));
      next = { ...original, width: original.width * factor, height: original.height * factor };
    } else next = { ...original, rotation: ((original.rotation + (Math.atan2(dy, dx) - current.angle) * 180 / Math.PI + 540) % 360) - 180 };
    draftRef.current = next; setDraft(next);
  }
  function move(event: ReactPointerEvent<Element>) {
    if (!gesture.current) return;
    pending.current = point(event);
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; if (pending.current) transform(pending.current); pending.current = undefined; });
  }
  function finish(event: ReactPointerEvent<Element>) {
    if (!gesture.current) return;
    cancelAnimationFrame(frame.current); frame.current = 0;
    transform(point(event));
    const next = draftRef.current, original = gesture.current.layer;
    gesture.current = undefined; pending.current = undefined; draftRef.current = undefined; setDraft(undefined);
    if (next && (next.x !== original.x || next.y !== original.y || next.width !== original.width || next.height !== original.height || next.rotation !== original.rotation)) updateLayer(next);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function cancel() { cancelAnimationFrame(frame.current); frame.current = 0; gesture.current = undefined; pending.current = undefined; draftRef.current = undefined; setDraft(undefined); }
  const pointerEvents = { onPointerMove: move, onPointerUp: finish, onPointerCancel: cancel, onLostPointerCapture: cancel };
  function canvasDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    event.currentTarget.focus(); const location = point(event);
    const target = tool === "select" ? hitLayer(project.layers, location) : active;
    if (tool !== "select") { if (target?.kind === "image" && target.visible) void editMask(target, location); else notice("Selecciona una capa de imagen para editar su fondo"); return; }
    setSelectedId(target?.id); endGroup();
    if (target?.locked) { notice("Capa bloqueada. Desbloquéala desde la lista de capas."); return; }
    if (target) start(event, "move", target);
  }
  function keyboard(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!active || active.locked) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") { event.preventDefault(); duplicate(); return; }
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(); return; }
    const step = event.shiftKey ? 10 : 1;
    const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[event.key];
    if (delta) { event.preventDefault(); updateLayer({ ...active, x: active.x + delta[0], y: active.y + delta[1] }, `keyboard:${active.id}`); }
  }

  return <div className={`graphic-editor ${focusView ? "is-focus-view" : ""}`} data-panel={mobilePanel} onKeyDownCapture={event => { if (event.key === "Escape") { cancel(); setFocusView(false); } }}>
    <div className="editor-mobile-panels" role="group" aria-label="Panel del editor">{[["canvas", "Lienzo"], ["settings", "Ajustes"], ["layers", "Capas"]].map(([id, title]) => <button key={id} aria-pressed={mobilePanel === id} onClick={() => { cancel(); setMobilePanel(id); }}>{title}</button>)}</div>
    <div className="editor-toolbar">
      <label className={`editor-import ${working || busy ? "is-disabled" : ""}`}>Agregar imágenes<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={working || busy} onChange={importFiles} /></label>
      <button disabled={working || busy} onClick={addText}>+ Texto</button>
      <div className="editor-tool-group">{([['select', 'Seleccionar'], ['remove', 'Eliminar color'], ['restore', 'Restaurar']] as const).map(([value, label]) => <button key={value} className={tool === value ? "selected" : ""} disabled={working || (value !== "select" && active?.kind !== "image")} onClick={() => setTool(value)}>{label}</button>)}</div>
      <button onClick={onNew} disabled={working || busy}>Nuevo</button>
      <button className="editor-preview-button" disabled={!project.layers.some(item => item.visible) || working || busy} onClick={onPreview}>Ver en camiseta 3D</button>
    </div>
    <div className="editor-stage">
      <div className="editor-viewbar"><span>{(project.width / project.dpi * 2.54).toFixed(1)} × {(project.height / project.dpi * 2.54).toFixed(1)} cm · {project.dpi} DPI</span><div><select aria-label="Fondo de vista" title="Solo cambia la vista; el PNG conserva la transparencia" value={viewBackground} onChange={event => setViewBackground(event.target.value)}><option value="transparent">Transparencia</option><option value="dark">Fondo oscuro</option><option value="light">Fondo blanco</option></select><ViewControls {...view} /><button aria-pressed={focusView} onClick={() => setFocusView(value => !value)}>{focusView ? "Salir de vista amplia" : "Vista amplia"}</button></div></div>
      <div className={`editor-viewport ${view.pan ? "is-panning" : ""}`} ref={view.viewportRef} {...view.events}>
        <div className="editor-sheet-space" style={view.space}>
          <div className={`editor-board editor-background-${viewBackground}`} ref={board} style={{ width: project.width * scale, height: project.height * scale }}>
            <canvas ref={canvas} aria-label="Lienzo del diseño" tabIndex={0} className={tool === "select" ? "" : "editor-mask-tool"} onPointerDown={canvasDown} {...pointerEvents} onKeyDown={keyboard} onKeyUp={endGroup} onBlur={endGroup} />
            {layer?.visible && <svg className="editor-selection" viewBox={`0 0 ${project.width} ${project.height}`}>
              <g transform={`translate(${layer.x} ${layer.y}) rotate(${layer.rotation})`}>
                <rect x={-layer.width / 2} y={-layer.height / 2} width={layer.width} height={layer.height} className={layer.locked ? "is-locked" : ""} />
                {tool === "select" && !layer.locked && <>
                  <line x1={0} y1={-layer.height / 2} x2={0} y2={-layer.height / 2 - 26 / scale} />
                  <circle className="editor-handle-hit" cx={0} cy={-layer.height / 2 - 26 / scale} r={22 / scale} role="button" aria-label="Girar objeto" onPointerDown={event => start(event, "rotate")} {...pointerEvents} /><circle className="editor-handle-dot" cx={0} cy={-layer.height / 2 - 26 / scale} r={7 / scale} />
                  {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y], index) => <g key={index}><circle className="editor-handle-hit" cx={x * layer.width / 2} cy={y * layer.height / 2} r={22 / scale} role="button" aria-label={`Escalar objeto desde esquina ${index + 1}`} onPointerDown={event => start(event, "resize")} {...pointerEvents} /><circle className="editor-handle-dot" cx={x * layer.width / 2} cy={y * layer.height / 2} r={6 / scale} /></g>)}
                </>}
              </g>
            </svg>}
            {!project.layers.length && <div className="editor-empty-hint"><strong>Tu próximo estampado empieza aquí</strong><span>Agrega imágenes y texto para componer el diseño.</span></div>}
          </div>
        </div>
      </div>
    </div>
    <div className="editor-sidebar">
      <div className="editor-inspector"><EditorProperties key={project.id} project={project} layer={layer} tool={tool} section={section} originalHalftone={originalHalftone} onOriginalHalftone={setOriginalHalftone} onChange={updateLayer} onQualityApply={applyQuality} onProject={commit} endGroup={endGroup} onDelete={remove} onDuplicate={duplicate} onReorder={reorder} mode={mode} setMode={setMode} tolerance={tolerance} setTolerance={setTolerance} brush={brush} setBrush={setBrush} notice={notice} /></div>
      <section className="editor-layer-panel"><h2>Capas <span>{project.layers.length}</span></h2>
        {project.layers.length ? [...project.layers].reverse().map(item => <div key={item.id} className={`editor-layer ${item.id === selectedId ? "is-selected" : ""}`}>
          <button className="editor-layer-name" onClick={() => { setSelectedId(item.id); setMobilePanel("canvas"); endGroup(); }} title={item.name}>{item.kind === "text" ? "T" : "▧"} <span>{item.name || "Sin nombre"}</span></button>
          <button aria-label={`${item.visible ? "Ocultar" : "Mostrar"} ${item.name}`} aria-pressed={item.visible} onClick={() => updateLayer({ ...item, visible: !item.visible })}>{item.visible ? "◉" : "○"}</button>
          <button aria-label={`${item.locked ? "Desbloquear" : "Bloquear"} ${item.name}`} aria-pressed={item.locked} onClick={() => updateLayer({ ...item, locked: !item.locked })}>{item.locked ? "🔒" : "◇"}</button>
        </div>) : <p className="editor-help">Las imágenes y los textos aparecen aquí.</p>}
      </section>
    </div>
    <div className="editor-status"><span role="status" aria-label="Estado del editor">{working ? "Procesando imagen…" : rendering ? "Generando vista previa…" : status}</span><span>Dos dedos para ampliar · Mover vista para desplazar · Esquinas para cambiar tamaño</span></div>
  </div>;
}
