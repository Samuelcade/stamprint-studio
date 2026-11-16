import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { importImageFile } from "../graphic-editor/render";
import { defaultTraceOptions, emptyVectorSession, pathData, Point, TraceOptions, VectorResult, VectorSession } from "./vector";
import { vectorSvg } from "./vector";
import { loadVectorSession, saveVectorSession } from "./store";
import { downloadFile, dpiFor8K, rasterizeVector, vectorPng } from "./io";
import { previewLayout } from "./preview";
import { ImageEnhancer } from "./ImageEnhancer";
import "./vector.css";

export interface VectorInput { source: string; name: string; widthCm: number }
export interface EditorVectorImage extends VectorInput { width: number; height: number }
interface Props { hasEditorDesign: boolean; onUseEditor: () => Promise<VectorInput>; onAddToEditor: (image: EditorVectorImage) => void }
interface History { present: VectorSession; past: VectorSession[]; future: VectorSession[]; group?: string }
interface NodeSelection { path: string; contour: number; index: number }
const errorText = (error: unknown) => error instanceof Error ? error.message : "No se pudo completar la operación.";
const countNodes = (result?: VectorResult) => result?.paths.reduce((sum, path) => sum + path.contours.reduce((count, ring) => count + ring.length, 0), 0) ?? 0;
const presets: Record<string, TraceOptions> = {
  logo: { ...defaultTraceOptions, colors: 4, simplification: .7, minArea: 8 },
  illustration: { ...defaultTraceOptions, colors: 12, resolution: 1024 },
  detailed: { ...defaultTraceOptions, colors: 16, resolution: 2048, simplification: .6, minArea: 2 },
  cut: { ...defaultTraceOptions, mode: "mono", minArea: 12, simplification: .6 },
};
function MeasureField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(2))));
  const edited = useRef(false);
  useEffect(() => { if (!edited.current) setDraft(String(Number(value.toFixed(2)))); }, [value]);
  return <label>{label}<input type="number" min={min} max={max} step="0.01" value={draft} onChange={event => { edited.current = true; setDraft(event.target.value); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={() => {
    if (!edited.current) return; edited.current = false;
    const next = Number(draft);
    if (!draft.trim() || !Number.isFinite(next) || next < min || next > max) { setDraft(String(Number(value.toFixed(2)))); return; }
    onCommit(next); setDraft(String(Number(next.toFixed(2))));
  }} /></label>;
}

export function VectorStudio({ hasEditorDesign, onUseEditor, onAddToEditor }: Props) {
  const [history, setHistory] = useState<History>(() => ({ present: emptyVectorSession(), past: [], future: [] }));
  const current = useRef(history); current.current = history;
  const session = history.present, result = session.result;
  const [ready, setReady] = useState(false), [loading, setLoading] = useState(false), [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState("Carga un logotipo o una ilustración para empezar."), [error, setError] = useState("");
  const [view, setView] = useState("vector"), [zoom, setZoom] = useState(1), [background, setBackground] = useState("checker");
  const [enhancing, setEnhancing] = useState(false);
  const [selected, setSelected] = useState<string>(), [nodes, setNodes] = useState(false), [node, setNode] = useState<NodeSelection>();
  const [draftResult, setDraftResult] = useState<VectorResult>(), [dpi, setDpi] = useState(300);
  const [pngMode, setPngMode] = useState<"dpi" | "8k">("dpi");
  const [viewport, setViewport] = useState({ width: 600, height: 500 }), [sourceAspect, setSourceAspect] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null), persisted = useRef(session);
  const pathCache = useRef(new WeakMap<object, { smooth: boolean; d: string }>());
  const task = useRef<Worker | null>(null), generation = useRef(0), mounted = useRef(true);
  const svg = useRef<SVGSVGElement>(null), gesture = useRef<{ original: VectorResult; node: NodeSelection; pointerId: number; start: Point } | null>(null);
  const pending = useRef<Point | undefined>(undefined), frame = useRef(0), draftRef = useRef<VectorResult | undefined>(undefined);
  const display = draftResult ?? result, selectedPath = display?.paths.find(path => path.id === selected);
  const totalNodes = useMemo(() => countNodes(result), [result]);
  const selectedNodeCount = useMemo(() => selectedPath?.contours.reduce((sum, ring) => sum + ring.length, 0) ?? 0, [selectedPath]);
  const visibleNodes = useMemo(() => nodes && selectedPath && selectedNodeCount <= 1500 ? selectedPath.contours.flatMap((points, contour) => points.map((point, index) => ({ point, contour, index }))) : [], [nodes, selectedPath, selectedNodeCount]);
  const preset = Object.keys(presets).find(key => (Object.keys(defaultTraceOptions) as (keyof TraceOptions)[]).every(option => presets[key][option] === session.options[option])) ?? "custom";
  const paths = useMemo(() => display?.paths.map(path => {
    let cached = pathCache.current.get(path.contours);
    if (!cached || cached.smooth !== session.smoothing) { cached = { smooth: session.smoothing, d: pathData(path.contours, session.smoothing) }; pathCache.current.set(path.contours, cached); }
    return { ...path, d: cached.d };
  }) ?? [], [display, session.smoothing]);
  const busy = loading || progress !== null;
  const canExport = !!result?.paths.some(path => path.visible) && !busy;
  const pendingSettings = !!result && !!session.tracedOptions && JSON.stringify(session.options) !== JSON.stringify(session.tracedOptions);
  const layout = previewLayout(viewport, result ? result.width / result.height : sourceAspect, view === "compare" && !!result, zoom);
  const exportDpi = result && pngMode === "8k" ? dpiFor8K(session.widthCm, result.width / result.height) : dpi;

  function commit(next: VectorSession, group?: string) {
    const state = current.current;
    if (next === state.present) return;
    cancelGesture();
    const updated = { present: next, past: group && state.group === group ? state.past : [...state.past.slice(-19), state.present], future: [], group };
    current.current = updated; setHistory(updated);
  }
  function endGroup() { if (current.current.group) { const state = { ...current.current, group: undefined }; current.current = state; setHistory(state); } }
  function stop() { generation.current++; task.current?.terminate(); task.current = null; setProgress(null); }
  function cancelGesture() { cancelAnimationFrame(frame.current); frame.current = 0; pending.current = undefined; gesture.current = null; draftRef.current = undefined; setDraftResult(undefined); }
  function undo(redo = false) {
    if (loading) return; stop(); cancelGesture();
    const state = current.current, next = redo ? state.future[0] : state.past.at(-1); if (!next) return;
    const updated = redo ? { present: next, past: [...state.past, state.present], future: state.future.slice(1) } : { present: next, past: state.past.slice(0, -1), future: [state.present, ...state.future] };
    current.current = updated; setHistory(updated); setNode(undefined); setSelected(next.result?.paths[0]?.id); setView(next.result ? "vector" : "original"); setError(""); setStatus(redo ? "Cambio rehecho" : "Cambio deshecho");
  }
  useEffect(() => {
    mounted.current = true; let cancelled = false;
    loadVectorSession().then(saved => { if (!cancelled && saved) { persisted.current = saved; const state = { present: saved, past: [], future: [] }; current.current = state; setHistory(state); setSelected(saved.result?.paths[0]?.id); setStatus("Vector local recuperado"); } }).catch(() => { if (!cancelled) setError("No se pudo recuperar el vector guardado. Puedes cargar una imagen para empezar otro trabajo."); }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; mounted.current = false; generation.current++; task.current?.terminate(); cancelAnimationFrame(frame.current); };
  }, []);
  useEffect(() => {
    if (!ready || session === persisted.current) return;
    // Track the queued snapshot: undo must also be saved while a prior write is pending.
    persisted.current = session;
    void saveVectorSession(session).catch(() => { if (mounted.current) setError("No se pudo guardar localmente. Descarga el SVG para conservar el resultado."); });
  }, [session, ready]);
  useEffect(() => {
    const host = viewportRef.current; if (!host || !ready) return;
    const resize = () => { if (host.clientWidth && host.clientHeight) setViewport({ width: host.clientWidth, height: host.clientHeight }); };
    const observer = new ResizeObserver(resize); resize(); observer.observe(host); return () => observer.disconnect();
  }, [ready, enhancing]);
  useEffect(() => { cancelGesture(); setNode(undefined); }, [view, selected, nodes]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (enhancing) return;
      if ((event.target as HTMLElement).closest("input,textarea,select,[contenteditable='true']")) return;
      if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); undo(event.key.toLowerCase() === "y" || event.shiftKey); }
      if (event.key === "Escape") { cancelGesture(); setNode(undefined); }
    };
    window.addEventListener("keydown", keyboard); return () => window.removeEventListener("keydown", keyboard);
  });

  function options(change: Partial<TraceOptions>) { commit({ ...session, options: { ...session.options, ...change } }, Object.keys(change).length === 1 ? "option:" + Object.keys(change)[0] : undefined); }
  async function loadSource(get: () => Promise<VectorInput>) {
    stop(); setLoading(true); setError(""); cancelGesture();
    try {
      const input = await get(); if (!mounted.current) return;
      commit({ ...current.current.present, ...input, result: undefined, tracedOptions: undefined }); setSourceAspect(1); setSelected(undefined); setNode(undefined); setZoom(1); setView("original"); setStatus("Imagen cargada. Ajusta las opciones y pulsa Vectorizar.");
    } catch (failure) { if (mounted.current) setError(errorText(failure)); } finally { if (mounted.current) setLoading(false); }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    await loadSource(async () => ({ ...await importImageFile(file), name: file.name.replace(/\.[^.]+$/, ""), widthCm: 25 }));
  }
  function trace() {
    if (!session.source || busy) return; stop(); cancelGesture(); setError(""); setProgress(0); setStatus("Preparando vectorización…");
    const version = generation.current, snapshot = session;
    try {
      const worker = new Worker(new URL("./trace.worker.ts", import.meta.url), { type: "module" }); task.current = worker;
      worker.onmessage = event => {
        if (!mounted.current || version !== generation.current) return;
        const message = event.data;
        if (message.type === "progress") { setProgress(message.progress); setStatus(message.stage); }
        else if (message.type === "done") {
          commit({ ...snapshot, result: message.result, tracedOptions: { ...snapshot.options } }); setSelected(message.result.paths[0]?.id); setNode(undefined); setView("vector");
          setStatus(`Vector listo · ${message.result.paths.length} colores · ${countNodes(message.result).toLocaleString("es-CO")} nodos`); stop();
        } else if (message.type === "error") { setError(message.message); stop(); }
      };
      worker.onerror = event => { event.preventDefault(); if (version === generation.current && mounted.current) { setError("No se pudo vectorizar. Prueba con menos detalle."); stop(); } };
      worker.postMessage({ source: session.source, options: session.options });
    } catch (failure) { setError(errorText(failure)); stop(); }
  }
  function editPath(change: { color?: string; visible?: boolean }) {
    if (!result || !selected) return;
    commit({ ...session, result: { ...result, paths: result.paths.map(path => path.id === selected ? { ...path, ...change } : path) } }, `color:${selected}`);
  }
  function updateNode(original: VectorResult, selectedNode: NodeSelection, point: Point) {
    const previous = original.paths.find(path => path.id === selectedNode.path)?.contours[selectedNode.contour]?.[selectedNode.index];
    if (!previous || (previous.x === point.x && previous.y === point.y)) return original;
    return { ...original, paths: original.paths.map(path => path.id !== selectedNode.path ? path : { ...path, contours: path.contours.map((ring, c) => c !== selectedNode.contour ? ring : ring.map((value, i) => i !== selectedNode.index ? value : point)) }) };
  }
  function location(event: { clientX: number; clientY: number }) {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return undefined;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: Math.max(0, Math.min(result!.width, point.x)), y: Math.max(0, Math.min(result!.height, point.y)) };
  }
  function moveNode(point: Point) {
    if (!gesture.current) return;
    const next = updateNode(gesture.current.original, gesture.current.node, point); draftRef.current = next; setDraftResult(next);
  }
  function nodeStart(event: ReactPointerEvent<SVGCircleElement>, selection: NodeSelection) {
    if (event.button !== 0 || busy || !result) return;
    const start = location(event); if (!start) return;
    endGroup(); event.stopPropagation(); event.preventDefault(); setNode(selection); gesture.current = { original: result, node: selection, pointerId: event.pointerId, start }; event.currentTarget.setPointerCapture(event.pointerId);
  }
  function nodeMove(event: ReactPointerEvent<SVGCircleElement>) {
    if (!gesture.current || gesture.current.pointerId !== event.pointerId) return; pending.current = location(event);
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; if (pending.current) moveNode(pending.current); });
  }
  function nodeFinish(event: ReactPointerEvent<SVGCircleElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = location(event);
    if (point && (point.x !== active.start.x || point.y !== active.start.y)) moveNode(point);
    else draftRef.current = active.original;
    const next = draftRef.current; cancelGesture(); if (next && next !== active.original) commit({ ...current.current.present, result: next });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function deleteNode() {
    if (!node || !result || busy || !selectedPath?.visible) return;
    const ring = result.paths.find(path => path.id === node.path)?.contours[node.contour];
    if (!ring || ring.length <= 3) { setError("Un contorno necesita al menos tres nodos."); return; }
    commit({ ...session, result: { ...result, paths: result.paths.map(path => path.id !== node.path ? path : { ...path, contours: path.contours.map((points, c) => c !== node.contour ? points : points.filter((_, i) => i !== node.index)) }) } }); setNode(undefined);
  }
  function insertNode() {
    if (!node || !result || busy || !selectedPath?.visible) return;
    const ring = result.paths.find(path => path.id === node.path)?.contours[node.contour]; if (!ring) return;
    const a = ring[node.index], b = ring[(node.index + 1) % ring.length]; if (!a || !b) return;
    if (countNodes(result) >= 60000) { setError("El vector ya tiene 60.000 nodos. Elimina o simplifica nodos antes de insertar más."); return; }
    commit({ ...session, result: { ...result, paths: result.paths.map(path => path.id !== node.path ? path : { ...path, contours: path.contours.map((points, c) => c !== node.contour ? points : [...points.slice(0, node.index + 1), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ...points.slice(node.index + 1)]) }) } });
    setNode({ ...node, index: node.index + 1 });
  }
  async function exportResult(kind: "svg" | "png" | "editor") {
    if (!result || !canExport) return; setLoading(true); setError("");
    try {
      const filename = session.name.trim().replace(/[<>:"/\\|?*]/g, "_") || "vector";
      if (kind === "svg") downloadFile(new Blob([vectorSvg(result, session.widthCm, session.smoothing)], { type: "image/svg+xml" }), `${filename}.svg`);
      else if (kind === "png") downloadFile(await vectorPng(session, exportDpi), `${filename}-${pngMode === "8k" ? "8k" : `${dpi}dpi`}.png`);
      else { const canvas = await rasterizeVector(session, 300, true); if (!mounted.current) return; onAddToEditor({ source: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, widthCm: session.widthCm, name: filename }); }
      if (mounted.current) setStatus(kind === "editor" ? "PNG añadido al editor; el SVG sigue disponible aquí." : `Archivo ${kind.toUpperCase()} descargado`);
    } catch (failure) { if (mounted.current) setError(errorText(failure)); } finally { if (mounted.current) setLoading(false); }
  }
  if (!ready) return <div className="module-page"><p>Cargando vectorización local…</p></div>;
  if (enhancing) return <ImageEnhancer initialSource={session.source} initialName={session.name} onBack={() => setEnhancing(false)} />;
  const ring = node && selectedPath?.id === node.path ? selectedPath.contours[node.contour] : undefined;
  const selectedPoint = ring?.[node?.index ?? -1];

  return <div className="vector-studio">
    <div className="vector-toolbar">
      <label className={`editor-import ${busy ? "is-disabled" : ""}`}>Cargar imagen<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={importFile} /></label>
      <button className="accent" disabled={busy} onClick={() => setEnhancing(true)}>✦ Mejorar imagen</button>
      <button disabled={busy || !hasEditorDesign} onClick={() => void loadSource(onUseEditor)}>Usar diseño del editor</button>
      <button disabled={busy || !history.past.length} onClick={() => undo()}>Deshacer vector</button><button disabled={busy || !history.future.length} onClick={() => undo(true)}>Rehacer vector</button>
      <button disabled={busy || !session.source} onClick={() => { commit(emptyVectorSession()); setSelected(undefined); setNode(undefined); setError(""); setStatus("Nuevo trabajo de vectorización"); }}>Nuevo vector</button>
      <span>VECTOR / SVG</span>
    </div>
    <aside className="vector-settings">
      <fieldset disabled={busy} onBlur={endGroup} onPointerUp={endGroup} onKeyUp={event => { if (event.target instanceof HTMLInputElement && event.target.type === "range") endGroup(); }}>
        <h2>Preparar trazado</h2>
        <label>Preajuste<select value={preset} onChange={event => { const next = presets[event.target.value]; if (next) options(next); }}><option value="custom">Personalizado</option><option value="logo">Logotipo · 4 colores</option><option value="illustration">Ilustración · 12 colores</option><option value="detailed">Ilustración detallada · 16 colores</option><option value="cut">Silueta · monocromo</option></select></label>
        <label>Modo de vectorización<select value={session.options.mode} onChange={event => options({ mode: event.target.value as TraceOptions["mode"] })}><option value="color">A color</option><option value="mono">Monocromo</option></select></label>
        {session.options.mode === "color" ? <label>Colores <output>{session.options.colors}</output><input aria-label="Número de colores" type="range" min="2" max="16" value={session.options.colors} onChange={event => options({ colors: Number(event.target.value) })} /></label> : <><label>Umbral <output>{session.options.threshold}</output><input aria-label="Umbral monocromo" type="range" min="1" max="255" value={session.options.threshold} onChange={event => options({ threshold: Number(event.target.value) })} /></label><label className="vector-check"><input type="checkbox" checked={session.options.invert} onChange={event => options({ invert: event.target.checked })} />Invertir selección tonal</label></>}
        <label>Detalle de análisis<select value={session.options.resolution} onChange={event => options({ resolution: Number(event.target.value) })}><option value="512">Rápido · 512 px</option><option value="768">Equilibrado · 768 px</option><option value="1024">Alto · 1024 px</option><option value="1280">Muy alto · 1280 px</option><option value="2048">Máximo · 2048 px</option></select></label>
        <label>Simplificación <output>{session.options.simplification} px</output><input aria-label="Simplificación" type="range" min="0" max="5" step="0.1" value={session.options.simplification} onChange={event => options({ simplification: Number(event.target.value) })} /></label>
        <label>Limpieza de puntos <output>{session.options.minArea} px²</output><input aria-label="Limpieza de puntos" type="range" min="0" max="100" value={session.options.minArea} onChange={event => options({ minArea: Number(event.target.value) })} /></label>
        <label className="vector-check"><input type="checkbox" checked={session.options.removeWhite} onChange={event => options({ removeWhite: event.target.checked })} />Quitar blanco</label>
        {session.options.removeWhite && <label>Tolerancia del blanco <output>{session.options.whiteTolerance}</output><input aria-label="Tolerancia del blanco" type="range" min="0" max="80" value={session.options.whiteTolerance} onChange={event => options({ whiteTolerance: Number(event.target.value) })} /></label>}
        <details><summary>Transparencia</summary><label>Umbral de alfa <output>{session.options.alphaThreshold}</output><input aria-label="Umbral de alfa" type="range" min="1" max="254" value={session.options.alphaThreshold} onChange={event => options({ alphaThreshold: Number(event.target.value) })} /></label><p>Los píxeles bajo este umbral se omiten. Los demás se convierten en rellenos sólidos.</p></details>
        <button className="accent" disabled={!session.source} onClick={trace}>{result ? "Volver a vectorizar" : "Vectorizar"}</button>
        <button onClick={() => options({ ...defaultTraceOptions })}>Restablecer ajustes</button>
        <p>Los ajustes se aplican al vectorizar. Un nuevo trazado reemplaza las ediciones del resultado; puedes deshacer.</p>
      </fieldset>
      {progress !== null && <div className="vector-progress"><progress max="100" value={progress} /><span>{progress}%</span><button onClick={() => { stop(); setStatus("Vectorización cancelada. Se conserva el resultado anterior."); }}>Cancelar vectorización</button></div>}
      <p className="vector-tip">Funciona mejor con logos, dibujos y colores planos. Las fotografías se simplifican en áreas de color.</p>
    </aside>
    <section className="vector-center">
      <div className="vector-viewbar"><div>{[['original', 'Original'], ['vector', 'Vector'], ['compare', 'Comparar'], ['outline', 'Contornos']].map(([value, label]) => <button key={value} aria-pressed={view === value} disabled={value !== "original" && !result} onClick={() => setView(value)}>{label}</button>)}</div><div><select aria-label="Fondo de vectorización" value={background} onChange={event => setBackground(event.target.value)}><option value="checker">Transparencia</option><option value="light">Blanco</option><option value="dark">Oscuro</option></select><button aria-label="Alejar vector" onClick={() => setZoom(value => Math.max(.25, value / 1.25))}>−</button><output aria-label="Zoom vector">{Math.round(zoom * 100)}%</output><button aria-label="Acercar vector" onClick={() => setZoom(value => Math.min(8, value * 1.25))}>+</button><button onClick={() => setZoom(1)}>Ajustar vector</button></div></div>
      <div ref={viewportRef} className={`vector-workspace vector-bg-${background}`}>
        {!session.source ? <div className="vector-empty"><span>✦</span><h1>De imagen a trazado</h1><p>Carga un PNG, JPG o WebP, o trae tu composición del editor. Obtén formas editables y un SVG escalable.</p></div> : <div className={`vector-artboards ${view === "compare" ? "is-comparing" : ""}`} style={{ width: layout.spaceWidth, minHeight: layout.spaceHeight }}>
          {(view === "original" || view === "compare" || !result) && <figure style={{ width: layout.width }}><figcaption>ORIGINAL</figcaption><img src={session.source} alt="Imagen original para vectorizar" onLoad={event => { const image = event.currentTarget; if (image.naturalHeight) setSourceAspect(image.naturalWidth / image.naturalHeight); }} style={{ width: layout.width, height: layout.height, objectFit: "contain" }} /></figure>}
          {display && view !== "original" && <figure style={{ width: layout.width }}><figcaption>{view === "outline" ? "CONTORNOS" : "VECTOR"}</figcaption><svg ref={svg} style={{ width: layout.width, height: layout.height }} viewBox={`0 0 ${display.width} ${display.height}`} aria-label="Resultado vectorial" onPointerDown={event => { if (event.target === event.currentTarget) { setSelected(undefined); setNode(undefined); } }}>
            {paths.filter(path => path.visible).map(path => <path key={path.id} d={path.d} fill={view === "outline" ? "none" : path.color} fillRule="evenodd" stroke={view === "outline" ? path.color : selected === path.id && nodes ? "#ff3b8d" : undefined} strokeWidth={view === "outline" ? 1 : .8} vectorEffect="non-scaling-stroke" className="vector-path" onPointerDown={event => { if (busy) return; event.stopPropagation(); setSelected(path.id); setNode(undefined); }} />)}
            {nodes && selectedPath?.visible && visibleNodes.length <= 1500 && visibleNodes.map(({ point, contour, index }) => <circle key={`${contour}-${index}`} cx={point.x} cy={point.y} r={4 * display.width / layout.width} className={`vector-node ${node?.contour === contour && node?.index === index ? "active" : ""}`} tabIndex={busy ? -1 : 0} aria-disabled={busy} role="button" aria-label={`Nodo ${contour + 1}-${index + 1}`} onFocus={() => setNode({ path: selectedPath.id, contour, index })} onPointerDown={event => nodeStart(event, { path: selectedPath.id, contour, index })} onPointerMove={nodeMove} onPointerUp={nodeFinish} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture} onKeyDown={event => {
              const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key];
              if (delta && result && !busy) { event.preventDefault(); const step = event.shiftKey ? 10 : 1; const next = updateNode(result, { path: selectedPath.id, contour, index }, { x: Math.max(0, Math.min(result.width, point.x + delta[0] * step)), y: Math.max(0, Math.min(result.height, point.y + delta[1] * step)) }); if (next !== result) commit({ ...session, result: next }, `node:${selectedPath.id}:${contour}:${index}`); }
            }} onKeyUp={endGroup} onBlur={endGroup} />)}
          </svg></figure>}
        </div>}
      </div>
      <div className="vector-status" role="status" aria-label="Estado de vectorización">{loading ? "Preparando imagen…" : status}</div>
      {pendingSettings && <div className="vector-pending" role="status">Ajustes sin aplicar. Pulsa Volver a vectorizar; las descargas usan el resultado que ves.</div>}
      {error && <div className="vector-error" role="alert">{error}</div>}
    </section>
    <aside className="vector-output"><fieldset disabled={busy || !result} onBlur={endGroup} onPointerUp={endGroup}>
      <h2>Resultado y medidas</h2>
      <label>Nombre del vector<input value={session.name} onChange={event => commit({ ...session, name: event.target.value }, "name")} /></label>
      <div className="vector-measures"><MeasureField label="Ancho vector (cm)" value={session.widthCm} min={.1} max={300} onCommit={value => commit({ ...session, widthCm: value })} /><MeasureField label="Alto vector (cm)" value={result ? session.widthCm * result.height / result.width : 0} min={result ? .1 * result.height / result.width : .1} max={result ? 300 * result.height / result.width : 300} onCommit={value => { if (result) commit({ ...session, widthCm: value * result.width / result.height }); }} /></div>
      <p>Proporciones vinculadas. El SVG incluye medidas físicas en cm.</p>
      <label className="vector-check"><input type="checkbox" checked={session.smoothing} onChange={event => commit({ ...session, smoothing: event.target.checked })} />Redondear curvas</label>
      <p>Redondear suaviza las esquinas; desactívalo para conservar ángulos y letras.</p>
      <label className="vector-check"><input type="checkbox" checked={nodes} onChange={event => { setNodes(event.target.checked); if (event.target.checked) setView("vector"); }} />Editar nodos</label>
      {nodes && <><p>Selecciona un color. Arrastra sus nodos o usa las flechas del teclado. Escape cancela un movimiento.</p>{selectedNodeCount > 1500 && <p className="vector-warning">Este color tiene más de 1500 nodos. Aumenta la simplificación para editarlos con fluidez.</p>}<div className="vector-actions"><button disabled={!node || !selectedPath?.visible} onClick={insertNode}>Insertar nodo</button><button disabled={!node || !selectedPath?.visible || !ring || ring.length <= 3} onClick={deleteNode}>Eliminar nodo</button></div>{selectedPoint && <p>Nodo: X {selectedPoint.x.toFixed(1)} · Y {selectedPoint.y.toFixed(1)}</p>}</>}
      <h2>Colores y formas</h2>
      <div className="vector-palette">{result?.paths.map((path, index) => <div key={path.id} className={selected === path.id ? "selected" : ""}><button aria-label={`Seleccionar color ${index + 1}`} aria-pressed={selected === path.id} onClick={() => { setSelected(path.id); setNode(undefined); }}><i style={{ background: path.color }} />{path.color.toUpperCase()}</button><button aria-label={`${path.visible ? "Ocultar" : "Mostrar"} color ${index + 1}`} onClick={() => { commit({ ...session, result: { ...result, paths: result.paths.map(item => item.id === path.id ? { ...item, visible: !item.visible } : item) } }); }}>{path.visible ? "◉" : "○"}</button></div>)}</div>
      {selectedPath && <><label>Color seleccionado<input type="color" value={selectedPath.color} onChange={event => editPath({ color: event.target.value })} /></label><button onClick={() => { commit({ ...session, result: { ...result!, paths: result!.paths.filter(path => path.id !== selected) } }); setSelected(undefined); setNode(undefined); }}>Eliminar color seleccionado</button></>}
      <div className="vector-statistics">{result?.paths.length ?? 0} colores · {totalNodes.toLocaleString("es-CO")} nodos</div>
      <button className="accent" disabled={!canExport} onClick={() => void exportResult("svg")}>Descargar SVG</button>
      <label>Calidad de exportación PNG<select value={pngMode} onChange={event => setPngMode(event.target.value as "dpi" | "8k")}><option value="dpi">Según medidas y DPI</option><option value="8k">8K · 7680 px en el lado mayor</option></select></label>
      {pngMode === "dpi" && <label>Resolución del PNG<select value={dpi} onChange={event => setDpi(Number(event.target.value))}>{[72, 150, 300, 600].map(value => <option key={value} value={value}>{value} DPI</option>)}</select></label>}
      {result && <p aria-label="Dimensiones del PNG">PNG: {Math.max(1, Math.round(session.widthCm / 2.54 * exportDpi))} × {Math.max(1, Math.round(session.widthCm / 2.54 * exportDpi * result.height / result.width))} px · {Number(exportDpi.toFixed(1))} DPI</p>}
      <button disabled={!canExport} onClick={() => void exportResult("png")}>Descargar PNG</button>
      <button disabled={!canExport} onClick={() => void exportResult("editor")}>Añadir PNG al editor</button>
      <p>El SVG conserva los trazados y se escala sin pixelarse. 8K rasteriza el vector a mayor tamaño, pero no recupera detalles ausentes en la imagen original. El editor recibe una copia PNG con las mismas medidas.</p>
    </fieldset></aside>
  </div>;
}
