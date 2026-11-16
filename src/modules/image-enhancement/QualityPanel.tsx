import { useEffect, useRef, useState } from "react";
import type { RasterLayer } from "../../core/types";
import { ProjectRenderer } from "../graphic-editor/render";
import { qualityDimensions, QualitySize } from "./quality";

interface Result { source: string; mask: string; width: number; height: number }
interface Props { layer: RasterLayer; dpi: number; onApply: (original: RasterLayer, improved: RasterLayer) => void; notice: (message: string) => void }
const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("No se pudo preparar el resultado")); reader.readAsDataURL(blob);
});

export function QualityPanel({ layer, dpi, onApply, notice }: Props) {
  const [size, setSize] = useState<QualitySize>("4k"), [strength, setStrength] = useState(35);
  const [result, setResult] = useState<Result>();
  const [progress, setProgress] = useState<number | null>(null), [stage, setStage] = useState("");
  const [error, setError] = useState(""), [downloading, setDownloading] = useState(false);
  const [before, setBefore] = useState(false), [actualPixels, setActualPixels] = useState(false);
  const worker = useRef<Worker | null>(null), generation = useRef(0);
  useEffect(() => {
    generation.current++; worker.current?.terminate(); worker.current = null;
    setResult(undefined); setProgress(null); setError("");
    return () => { generation.current++; worker.current?.terminate(); worker.current = null; };
  }, [layer.id, layer.source, layer.mask, layer.locked]);
  let target: { width: number; height: number } | undefined;
  try { target = qualityDimensions(layer.pixelWidth, layer.pixelHeight, size); } catch { /* Display validation below. */ }
  const improvedLayer = result ? { ...layer, source: result.source, mask: result.mask, pixelWidth: result.width, pixelHeight: result.height } : undefined;
  function stop() { generation.current++; worker.current?.terminate(); worker.current = null; setProgress(null); setStage(""); }
  function settingsChanged() { stop(); setResult(undefined); setError(""); }
  async function process() {
    if (!target || layer.locked || worker.current) return;
    const version = ++generation.current;
    setResult(undefined); setError(""); setProgress(0); setStage("Iniciando mejora"); setBefore(false);
    try {
      const task = new Worker(new URL("./quality.worker.ts", import.meta.url), { type: "module" }); worker.current = task;
      task.onmessage = async event => {
        if (generation.current !== version) return;
        const message = event.data;
        if (message.type === "progress") { setProgress(message.progress); setStage(message.stage); }
        else if (message.type === "done") {
          try {
            const [source, mask] = await Promise.all([dataUrl(message.blob), message.maskBlob ? dataUrl(message.maskBlob) : ""]);
            if (generation.current !== version) return;
            setResult({ source, mask, width: message.width, height: message.height }); setProgress(null); setStage("Compara el resultado antes de aplicarlo");
          } catch (failure) { if (generation.current === version) { setError((failure as Error).message); setProgress(null); } }
          finally { task.terminate(); if (worker.current === task) worker.current = null; }
        } else if (message.type === "error") { setError(message.message); stop(); }
      };
      task.onerror = event => { event.preventDefault(); if (generation.current === version) { setError("No se pudo procesar. Prueba 2× o una imagen más pequeña."); stop(); } };
      task.postMessage({ source: layer.source, mask: layer.mask, size, strength });
    } catch (failure) { setError((failure as Error).message); stop(); }
  }
  async function download() {
    if (!improvedLayer) return;
    setDownloading(true);
    try {
      // Standalone image export retains full improved resolution, mask and color effects.
      const { pixelWidth: width, pixelHeight: height } = improvedLayer;
      const renderer = new ProjectRenderer();
      const blob = await renderer.exportPng({ id: "quality-export", name: layer.name, width, height, dpi, updatedAt: "", layers: [{ ...improvedLayer, x: width / 2, y: height / 2, width, height, rotation: 0, visible: true }] });
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `${layer.name.replace(/\.[^.]+$/, "")}-${width}x${height}.png`; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000); notice(`Imagen mejorada descargada: ${width} × ${height} px`);
    } catch (failure) { setError((failure as Error).message); } finally { setDownloading(false); }
  }
  return <section className="quality-panel" aria-label="Mejorar resolución y nitidez">
    <h2>Mejoramiento · calidad</h2>
    <div className="quality-resolution"><span>Imagen actual</span><strong>{layer.pixelWidth} × {layer.pixelHeight} px</strong></div>
    <label>Resolución de mejora<select value={size} disabled={progress !== null} onChange={event => { settingsChanged(); setSize(event.target.value as QualitySize); }}><option value="original">Solo mejorar nitidez</option><option value="2x">Ampliar 2× (hasta 4096 px)</option><option value="4k">4K · lado mayor de 4096 px</option></select></label>
    <label>Nitidez de mejora <output>{strength}%</output><input aria-label="Nitidez de mejora" type="range" min="0" max="100" value={strength} disabled={progress !== null} onChange={event => { settingsChanged(); setStrength(Number(event.target.value)); }} /></label>
    <p className="editor-help">{target ? `Resultado: ${target.width} × ${target.height} px. Conserva proporciones y transparencia.` : "Esta imagen supera el límite de 4096 píxeles por lado."}</p>
    {target && size === "2x" && Math.max(layer.pixelWidth, layer.pixelHeight) * 2 > 4096 && <p className="editor-help">La ampliación se limita a 4096 px por lado.</p>}
    <p className="editor-help">Ampliación bicúbica y enfoque local, sin IA. Más píxeles no recuperan detalles perdidos.</p>
    {progress !== null ? <div className="quality-progress"><progress max="100" value={progress} /><span role="status">{stage} · {progress}%</span><button type="button" onClick={stop}>Cancelar mejora</button></div> : <button type="button" className="accent" disabled={!target || downloading} onClick={() => void process()}>Generar mejora</button>}
    {error && <p className="quality-error" role="alert">{error}</p>}
    {result && <>
      <div className="editor-inline"><button type="button" aria-pressed={before} onClick={() => setBefore(true)}>Antes</button><button type="button" aria-pressed={!before} onClick={() => setBefore(false)}>Después</button></div>
      <label className="editor-check"><input type="checkbox" checked={actualPixels} onChange={event => setActualPixels(event.target.checked)} />Ver detalle al 100%</label>
      <div className={`quality-preview ${actualPixels ? "actual-pixels" : ""}`}>
        <img src={before ? layer.source : result.source} alt={before ? "Imagen antes de mejorar" : "Imagen mejorada"} style={{ width: actualPixels ? result.width : undefined, height: actualPixels ? result.height : undefined, maskImage: (before ? layer.mask : result.mask) ? `url("${before ? layer.mask : result.mask}")` : undefined, maskSize: "100% 100%" }} />
      </div>
      <p className="editor-help">{before ? "Original ampliado al mismo tamaño para comparar" : `${result.width} × ${result.height} px`}. Comparación de resolución antes de los ajustes de color.</p>
      <button type="button" className="accent" disabled={downloading} onClick={() => { if (improvedLayer) { onApply(layer, improvedLayer); setResult(undefined); } }}>Aplicar a la capa</button>
      <button type="button" disabled={downloading} onClick={() => void download()}>{downloading ? "Preparando PNG…" : "Descargar imagen mejorada"}</button>
      <p className="editor-help">Aplicar conserva la posición y las medidas en cm. Puedes deshacer. La descarga guarda la imagen a su resolución mejorada; Exportar PNG usa las medidas del documento.</p>
    </>}
  </section>;
}
