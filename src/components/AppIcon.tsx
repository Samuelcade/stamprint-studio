const paths: Record<string, string> = {
  "Inicio": "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  "Proyectos": "M3 7V5h7l2 2h9v13H3Z",
  "Editor gráfico": "m15 4 5 5M4 20l4-1L21 6l-4-4L4 15ZM3 21h18",
  "Vectorización": "M5 5h14v14H5ZM3 3h4v4H3Zm14 0h4v4h-4ZM3 17h4v4H3Zm14 0h4v4h-4Z",
  "Semitonos": "M6 5h.01M12 5h.01M18 5h.01M6 12h.01M12 12h.01M18 12h.01M6 19h.01M12 19h.01M18 19h.01",
  "Simulador 3D": "m12 2 9 5v10l-9 5-9-5V7Zm0 10 9-5M12 12 3 7m9 5v10",
  "DTF": "M6 8V3h12v5M6 17H3V8h18v9h-3M6 13h12v8H6Z",
  "Serigrafía": "M4 3h16v13H4Zm3 13v5m10-5v5M4 9h16",
  "Piedrería": "m12 2 9 8-9 12-9-12Zm-9 8h18M12 2l-4 8 4 12 4-12Z",
  "Plantillas": "M3 3h18v18H3Zm0 13 6-6 4 4 3-3 5 5M16 7h.01",
  "Configuración": "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
};
export function AppIcon({ name }: { name: string }) {
  return <svg className="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "Semitonos" ? 4 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.Inicio} /></svg>;
}
