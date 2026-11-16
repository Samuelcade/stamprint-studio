# Stamprint Studio para macOS e iOS

Este paquete contiene el código actual, las fotos, el modelo 3D, el proyecto Xcode y la aplicación web compilada. **Es un proyecto fuente, no un instalador DMG ni un IPA.** No incluye certificados ni claves privadas. Las versiones Apple aún necesitan compilarse y probarse en un Mac.

## Compilar sin Mac propio mediante GitHub

El proyecto incluye `.github/workflows/installers.yml`, de ejecución manual. Su configuración se ha revisado localmente; aún no se ha ejecutado en GitHub ni se han generado binarios Apple.

1. Sube el contenido del paquete fuente a un repositorio propio, incluyendo la carpeta oculta `.github`. Conserva las imágenes PNG de la raíz y `t_shirt.glb`. No subas `node_modules`, certificados ni carpetas de instaladores.
2. En la rama predeterminada, abre **Actions → Generar instaladores → Run workflow** y elige `macos`.
3. Cuando termine correctamente, descarga **Stamprint-macOS-sin-notarizar** desde **Artifacts**. Incluye DMG y ZIP para Intel y Apple Silicon. Son paquetes de prueba, sin firma Developer ID ni notarización; macOS puede bloquear su apertura.
4. `windows` genera el EXE. `ios-simulator` genera únicamente una app para el simulador de Xcode; **no genera un IPA para iPhone**. `all` ejecuta las tres compilaciones.

Para un IPA instalable en dispositivos hay que definir el método de distribución y configurar certificados y perfiles de Apple Developer. Este flujo no tiene firma iOS configurada ni publica en tiendas. Los recursos de GitHub Actions dependen del plan de la cuenta; los archivos de salida se conservan 14 días.

Documentación de ejecución manual: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow

## Preparación local en un Mac

1. Descomprime todo el ZIP en una carpeta local. Conserva `ios`, `src` y el resto de carpetas juntas.
2. Instala Node.js 22 o superior y Xcode compatible con Capacitor 8. Abre Xcode y termina la instalación de sus componentes y del SDK de iOS.
3. En Terminal, entra en la carpeta extraída y ejecuta `npm ci`. Esto instala las dependencias exactas del proyecto y las bibliotecas de Filesystem y Share que usa el proyecto iOS.
4. Ejecuta `npm test` y `npm run build`.

## macOS (Intel y Apple Silicon)

Ejecuta `npm run build:mac`. Se generan DMG y ZIP para x64 y arm64 en `installers/mac`. No se publican automáticamente.

El identificador de la aplicación es `com.stamprint.studio`. Para distribuir fuera de tu propio equipo, configura el certificado Developer ID y la notarización de Apple según electron-builder. El comando usa la configuración de firma disponible; no incorpora ni inventa credenciales. Comprueba ambas arquitecturas antes de distribuirlas.

## iOS: simulador

Ejecuta `npm run build:ios`. Compila para el simulador sin firma de dispositivo y empaqueta el resultado en `installers/ios`. Este ZIP solo sirve para el simulador de Xcode, no se instala en un iPhone.

## iPhone o iPad real

1. Ejecuta `npm run open:ios` para sincronizar los recursos actuales y abrir Xcode.
2. Selecciona el proyecto **App**, el target **App** y **Signing & Capabilities**. Selecciona tu equipo de Apple. El identificador es `com.stamprint.studio`; la versión y el número de compilación se sincronizan desde `package.json`.
3. Conecta el dispositivo, selecciónalo como destino y ejecuta **Run** para probar.
4. Para distribución, usa **Product → Archive** y después **Distribute App** en Organizer. Xcode solicita la cuenta, certificados y perfiles correspondientes al método elegido (por ejemplo, TestFlight).

También puedes definir `APPLE_TEAM_ID` en tu sesión de Terminal y ejecutar `npm run build:ios:archive` una vez configurada la firma. Produce un `.xcarchive`; la exportación de un IPA firmado se realiza desde Organizer. No se publica ni sube nada automáticamente.

## Qué revisar antes de distribuir

- Abrir proyectos existentes, editar y guardar copias; los datos son locales a cada dispositivo.
- Importar PNG/JPG/WebP, zoom táctil, medidas y texto.
- Compartir/guardar exportaciones PNG, SVG, PDF y video mediante el menú nativo en iOS.
- Simulador 3D y formatos de video disponibles en el dispositivo; dependen del soporte de su WebView.
- Plantillas, colores, vectorización, semitonos, DTF y piedrería.

La aplicación web también puede instalarse desde Safari mediante **Compartir → Añadir a pantalla de inicio** cuando está alojada en HTTPS. El ZIP web requiere alojamiento; no sustituye un IPA ni un DMG.

Referencias: https://capacitorjs.com/docs/ios · https://capacitorjs.com/docs/getting-started/environment-setup · https://www.electron.build/v26/docs/features/multi-platform-build/
