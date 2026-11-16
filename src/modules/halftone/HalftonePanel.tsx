import { useEffect, useRef, useState } from "react";
import type { HalftoneOptions, RasterEffects, RasterLayer } from "../../core/types";
import { defaultHalftoneOptions, halftoneOptions, screenGeometry } from "./halftone";

function Slider({ label, value, min, max, step = 1, suffix = "", change }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; change: (value: number) => void }) {
  const [draft, setDraft] = useState(value), dirty = useRef(false);
  useEffect(() => { setDraft(value); dirty.current = false; }, [value]);
  const finish = () => { if (dirty.current) { dirty.current = false; change(draft); } };
  return <label>{label}<output>{draft}{suffix}</output><input aria-label={label} type="range" value={draft} min={min} max={max} step={step} onChange={event => { dirty.current = true; setDraft(Number(event.target.value)); }} onPointerUp={finish} onKeyUp={finish} onBlur={finish} onPointerCancel={() => { dirty.current = false; setDraft(value); }} /></label>;
}
interface Props { layer: RasterLayer; dpi: number; change: (effects: Partial<RasterEffects>) => void; original: boolean; onOriginal: (value: boolean) => void }
export function HalftonePanel({ layer, dpi, change, original, onOriginal }: Props) {
  const options = halftoneOptions(layer), { settings, width, height } = screenGeometry(layer, dpi);
  const patch = (values: Partial<HalftoneOptions>) => change({ halftoneOptions: { ...options, ...values } });
  const spacing = Math.min(settings.cellX, settings.cellY);
  const preset = [30, 45, 60].find(lpi => options.unit === "lpi" && options.lpi === lpi && options.angle === 45 && options.shape === "circle" && options.gamma === 1 && !options.invert);
  return <section className="halftone-panel" aria-label="Configuración de semitonos">
    <h2>Semitonos · una tinta</h2>
    <p className="editor-help">Convierte los tonos de esta imagen en puntos o líneas con fondo transparente.</p>
    <label className="editor-check"><input type="checkbox" checked={layer.effects.halftone} onChange={event => { onOriginal(false); change({ halftone: event.target.checked }); }} />Activar semitonos</label>
    {layer.effects.halftone && <>
      <div className="editor-inline"><button type="button" aria-pressed={original} onClick={() => onOriginal(true)}>Ver original</button><button type="button" aria-pressed={!original} onClick={() => onOriginal(false)}>Ver semitono</button></div>
      {original && <p className="halftone-note">Vista original. La exportación conserva el semitono aplicado.</p>}
      <label>Preajuste de trama<select value={preset ?? "custom"} onChange={event => { if (event.target.value !== "custom") patch({ unit: "lpi", lpi: Number(event.target.value), angle: 45, shape: "circle", gamma: 1, invert: false }); }}><option value="custom">Personalizado</option><option value="30">Grueso · 30 LPI</option><option value="45">Medio · 45 LPI</option><option value="60">Fino · 60 LPI</option></select></label>
      <label>Medida de trama<select value={options.unit} onChange={event => patch({ unit: event.target.value as HalftoneOptions["unit"] })}><option value="source">Píxeles de la imagen original</option><option value="lpi">Frecuencia de impresión (LPI)</option></select></label>
      {options.unit === "source" ? <Slider label="Tamaño de trama (px)" value={layer.effects.halftoneCell} min={3} max={64} suffix=" px" change={halftoneCell => change({ halftoneCell })} /> : <><Slider label="Frecuencia (LPI)" value={options.lpi} min={5} max={120} suffix=" LPI" change={lpi => patch({ lpi })} /><p className="editor-help">{(25.4 / options.lpi).toFixed(2)} mm entre celdas. Los LPI se conservan al cambiar los cm o los DPI.</p></>}
      <label>Forma de trama<select value={options.shape} onChange={event => patch({ shape: event.target.value as HalftoneOptions["shape"] })}><option value="circle">Puntos redondos</option><option value="square">Puntos cuadrados</option><option value="line">Líneas</option></select></label>
      <Slider label="Ángulo de trama" value={options.angle} min={0} max={90} step={.5} suffix="°" change={angle => patch({ angle })} />
      <Slider label="Intensidad de tonos" value={options.gamma} min={.5} max={2} step={.05} change={gamma => patch({ gamma })} />
      <label>Color de tinta<input type="color" value={options.ink} onChange={event => patch({ ink: event.target.value })} /></label>
      <div className="editor-inline"><button type="button" onClick={() => patch({ ink: "#000000" })}>Tinta negra</button><button type="button" onClick={() => patch({ ink: "#ffffff" })}>Tinta blanca</button></div>
      <label className="editor-check"><input type="checkbox" checked={options.invert} onChange={event => patch({ invert: event.target.checked })} />Invertir tonos</label>
      <button type="button" onClick={() => { onOriginal(false); change({ halftoneCell: 8, halftoneOptions: { ...defaultHalftoneOptions } }); }}>Restablecer trama</button>
      <p className="editor-help">La trama se actualiza al soltar cada control. Negro produce tinta sólida; blanco deja transparencia. Invertir cambia esa relación.</p>
      <p className="editor-help" aria-label="Resolución de semitonos">Recurso: {width} × {height} px · {spacing.toFixed(1)} px por celda.</p>
      {spacing < 4 && <p className="halftone-note" role="status">{spacing < 1 ? "Trama demasiado fina para exportar." : "La trama tiene pocos píxeles por celda y puede perder detalle."} Reduce los LPI o aumenta el tamaño de trama. En LPI, aumentar los DPI ayuda hasta el límite del recurso.</p>}
      <p className="editor-help">Una sola tinta; no genera separaciones CMYK ni archivos de máquina. Comprueba la prueba de impresión. El ángulo es relativo a la capa.</p>
    </>}
  </section>;
}
