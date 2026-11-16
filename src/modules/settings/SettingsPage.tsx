import { ReleaseNotes } from "../../components/ReleaseNotes";
import { useState } from "react";
import type { FormEvent } from "react";
import { DEFAULT_SETTINGS, validateSettings } from "./settings";
import type { Settings } from "./settings";
import "./settings.css";

export function SettingsPage({ settings, onSave }: { settings: Settings; onSave: (settings: Settings) => void }) {
  const [autoSave, setAutoSave] = useState(settings.autoSave), [start, setStart] = useState(settings.startSection);
  const [width, setWidth] = useState(String(settings.editor.widthCm)), [height, setHeight] = useState(String(settings.editor.heightCm)), [dpi, setDpi] = useState(String(settings.editor.dpi)), [editorBg, setEditorBg] = useState(settings.editor.background);
  const [dtfWidth, setDtfWidth] = useState(String(settings.dtf.width)), [dtfHeight, setDtfHeight] = useState(String(settings.dtf.height)), [dtfGap, setDtfGap] = useState(String(settings.dtf.gap)), [dtfDpi, setDtfDpi] = useState(String(settings.dtf.dpi)), [dtfBg, setDtfBg] = useState(settings.dtf.background);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  function restore() {
    const s = DEFAULT_SETTINGS; setAutoSave(s.autoSave); setStart(s.startSection); setWidth(String(s.editor.widthCm)); setHeight(String(s.editor.heightCm)); setDpi(String(s.editor.dpi)); setEditorBg(s.editor.background); setDtfWidth(String(s.dtf.width)); setDtfHeight(String(s.dtf.height)); setDtfGap(String(s.dtf.gap)); setDtfDpi(String(s.dtf.dpi)); setDtfBg(s.dtf.background); setError(""); setMessage("Valores restablecidos en el formulario. Pulsa Guardar ajustes para aplicarlos.");
  }
  function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      if ([width, height, dpi, dtfWidth, dtfHeight, dtfGap, dtfDpi].some(value => !value.trim())) throw new Error("Completa todos los campos numéricos.");
      const next = validateSettings({ autoSave, startSection: start, editor: { widthCm: Number(width), heightCm: Number(height), dpi: Number(dpi), background: editorBg }, dtf: { width: Number(dtfWidth), height: Number(dtfHeight), gap: Number(dtfGap), dpi: Number(dtfDpi), background: dtfBg } });
      onSave(next); setMessage("Ajustes guardados en este navegador.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudieron guardar los ajustes."); }
  }
  return <div className="settings-page"><div className="settings-heading"><p className="eyebrow">PREFERENCIAS LOCALES</p><h1>Configuración</h1><p>Personaliza tu espacio de trabajo y las medidas que usas con más frecuencia.</p></div><form onSubmit={submit} noValidate>
    <div className="settings-cards"><section className="settings-card"><h2>General</h2><label className="settings-check"><input type="checkbox" checked={autoSave} onChange={event => setAutoSave(event.target.checked)} /> Guardado automático del editor</label><p>Guarda los cambios del proyecto del editor en este navegador. También puedes guardarlo manualmente.</p><label>Sección al iniciar<select value={start} onChange={event => setStart(event.target.value as Settings["startSection"])}>{["Inicio", "Editor gráfico", "Vectorización", "DTF", "Serigrafía", "Piedrería", "Plantillas"].map(item => <option key={item}>{item}</option>)}</select></label><p>Se aplica al volver a abrir o recargar la aplicación.</p></section>
    <section className="settings-card"><h2>Documentos nuevos</h2><div className="settings-fields"><label>Ancho predeterminado (cm)<input type="number" min="0.1" max="100" step="0.1" value={width} onChange={event => setWidth(event.target.value)} /></label><label>Alto predeterminado (cm)<input type="number" min="0.1" max="100" step="0.1" value={height} onChange={event => setHeight(event.target.value)} /></label><label>DPI predeterminados<input type="number" min="72" max="600" step="1" value={dpi} onChange={event => setDpi(event.target.value)} /></label><label>Fondo de vista del editor<select value={editorBg} onChange={event => setEditorBg(event.target.value as Settings["editor"]["background"])}><option value="transparent">Transparencia</option><option value="light">Blanco</option><option value="dark">Oscuro</option></select></label></div><p>Las medidas y DPI se usan al crear un documento nuevo. El fondo solo cambia la vista del editor.</p></section>
    <section className="settings-card"><h2>Mesa DTF</h2><div className="settings-fields"><label>Ancho predeterminado del rollo (cm)<input type="number" min="1" max="100" step="0.1" value={dtfWidth} onChange={event => setDtfWidth(event.target.value)} /></label><label>Largo predeterminado de hoja (cm)<input type="number" min="1" max="300" step="0.1" value={dtfHeight} onChange={event => setDtfHeight(event.target.value)} /></label><label>Separación predeterminada (cm)<input type="number" min="0" max="10" step="0.1" value={dtfGap} onChange={event => setDtfGap(event.target.value)} /></label><label>DPI predeterminados DTF<input type="number" min="72" max="600" step="1" value={dtfDpi} onChange={event => setDtfDpi(event.target.value)} /></label><label>Fondo predeterminado DTF<select value={dtfBg} onChange={event => setDtfBg(event.target.value as Settings["dtf"]["background"])}><option value="transparent">Transparente</option><option value="white">Blanco</option></select></label></div><p>Se usan en una mesa nueva. Para aplicar los valores a una mesa ya abierta, usa el botón correspondiente en DTF.</p></section></div>
    <div className="settings-footer"><button className="accent" type="submit">Guardar ajustes</button><button type="button" onClick={restore}>Restablecer valores</button></div>{message && <p className="settings-message" role="status">{message}</p>}{error && <p className="settings-error" role="alert">{error}</p>}
  </form><ReleaseNotes /></div>;
}
