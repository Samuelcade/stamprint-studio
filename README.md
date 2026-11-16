# STAMPRINT STUDIO

Aplicación local para composición y preparación de artes textiles, con vista de camiseta 3D.

## Incluido y comprobable

- React, TypeScript y Vite, con módulos separados para core, almacenamiento y eliminación de fondos.
- Editor de varias capas de imagen y texto; selección, movimiento, escala proporcional, rotación, duplicación, orden, bloqueo y visibilidad.
- Documento con medidas en centímetros y DPI, texto editable, opacidad e historial de deshacer/rehacer.
- Eliminación por color RGB con tolerancia configurable, en modo conectado (flood fill) o global.
- Restauración circular de la máscara sin reconstruir píxeles: la imagen original se conserva como fuente independiente.
- Persistencia automática en IndexedDB y recuperación del proyecto local más reciente.
- Exportación PNG con canal alfa real y metadatos de resolución pHYs (DPI).
- Mejora no destructiva de brillo, contraste y saturación.
- Mejoramiento local de resolución: solo nitidez, ampliación 2× o 4K (4096 px en el lado mayor), interpolación bicúbica y enfoque con protección de transparencia. Procesamiento en Web Worker, progreso, cancelación, comparación antes/después, aplicación reversible y descarga individual a resolución completa.
- Semitonos de una tinta con puntos redondos, cuadrados o líneas; ángulo, color de tinta, inversión, intensidad y tamaño en píxeles de origen o frecuencia física LPI. Cálculo en Web Worker y comparación con el original sin modificar el proyecto.
- Mesa DTF para componer hojas con varios diseños, medidas y separación configurables, distribución automática y exportación PNG transparente. El editor incluye espejo y una previsualización de base blanca; no genera canales propietarios de RIP.
- Prueba unitaria para la eliminación conectada y utilidad central de conversiones físicas.
- Simulador 3D con proyección GPU, arrastre, escala, giro, opacidad, espejo, frente/espalda, vista limpia y calibración de centímetros por altura de camiseta.
- La composición del editor (capas, texto, máscaras y efectos) se renderiza con el mismo motor para PNG y la vista 3D.
- Vectorización local a SVG con trazados reales, color o monocromo, preajustes, cuantización de 2–16 colores, limpieza, simplificación, transparencia, curvas opcionales, edición de colores/nodos, historial y guardado independiente.
- Plantillas publicitarias con las cinco fotografías aportadas, seis vistas, color de prenda, acabados de estampado, texto y descarga PNG para redes.

## Mejorar una imagen

Para mejorar una imagen sin vectorizar: abre **Vectorización → Mejorar imagen**, carga un PNG, JPG o WebP de hasta 4096 px por lado, selecciona la calidad y pulsa **Mejorar y descargar**. La opción predeterminada genera 8K (7680 px en el lado mayor); también hay 4K, 2× y nitidez sin ampliar. El proceso se ejecuta en un worker, conserva la transparencia y descarga un PNG. 8K puede tardar y requerir bastante memoria. Es una ampliación bicúbica con nitidez, no un modelo de IA ni una reconstrucción de detalles perdidos.

1. En **Editor gráfico**, agrega una imagen y selecciona su capa.
2. En **Objeto → Mejoramiento · calidad**, elige la resolución y la nitidez.
3. Pulsa **Generar mejora** y compara **Antes / Después**. Puedes activar **Ver detalle al 100%** y desplazarte por la vista.
4. **Aplicar a la capa** conserva posición y medidas en cm; **Deshacer** recupera el estado anterior.
5. **Descargar imagen mejorada** guarda esa imagen a su resolución completa, incluyendo máscara y ajustes de color. **Exportar PNG** guarda la composición a las dimensiones del documento; no cambia automáticamente a 4K.

La ampliación es un procesamiento local clásico, sin IA: aumenta resolución y enfoca bordes, pero no reconstruye detalles perdidos. 4K mantiene la proporción del archivo, no lo obliga a un formato 16:9. La ampliación 2× se limita a 4096 px por lado.

## Trabajar con semitonos

1. Abre **Semitonos**, agrega una imagen o selecciona una capa de imagen existente. El panel de trama aparece primero; las capas de texto siguen siendo editables, pero no reciben semitonos.
2. Marca **Activar semitonos**. Elige un preajuste de 30, 45 o 60 LPI, o usa el tamaño de trama en píxeles de la imagen original.
3. Configura puntos redondos, cuadrados o líneas; ángulo de 0–90°, intensidad de tonos y color de tinta. **Invertir tonos** intercambia la relación entre zonas claras y oscuras.
4. Los deslizadores aplican el cambio al soltarlos, para evitar cálculos continuos durante el movimiento. Cada ajuste se puede deshacer. **Restablecer trama** recupera los valores iniciales sin modificar la fuente ni los demás efectos.
5. **Ver original / Ver semitono** cambia únicamente la vista de la capa seleccionada. La exportación conserva la trama aplicada aunque estés comparando el original. Para ver tinta blanca, usa el fondo oscuro del lienzo.
6. Ajusta las medidas y los DPI en el editor. En modo LPI, la frecuencia física se conserva al cambiar el tamaño del objeto o los DPI. El ángulo de trama es relativo a la capa y gira con ella. Las máscaras se aplican antes de calcular los tonos y los píxeles transparentes no generan tinta.
7. **Exportar PNG** usa las medidas y DPI del documento. El mismo recurso tramado se utiliza en la vista previa, la exportación y la composición enviada al 3D. Al alejar la vista, la pantalla puede mostrar moiré o perder puntos finos; revisa el archivo a resolución de impresión.

Negro puro produce cobertura sólida; blanco puro deja transparencia. Las zonas intermedias varían el área del punto. La vista de semitonos se calcula a la resolución del objeto en el documento, limitada a 4096 px por lado y 12 megapíxeles. Un aviso indica cuando hay menos de 4 píxeles por celda; por debajo de 1 píxel, el cálculo se rechaza. Reduce LPI o aumenta el tamaño de celda; aumentar DPI ayuda hasta alcanzar el límite del recurso. La exportación conserva el tamaño del documento, aunque la capa puede estar limitada por ese recurso interno.

Es una trama raster de una tinta, no una separación CMYK ni un archivo de máquina o RIP. Los preajustes describen frecuencias, no garantizan compatibilidad con una malla o equipo específico.

## Mesa de impresión DTF

1. Abre **DTF** y configura el ancho del rollo, el largo de la hoja, la separación entre diseños y los DPI de exportación. El largo de hoja es configurable; la exportación incluye toda la longitud indicada.
2. Carga imágenes PNG, JPG o WebP, o usa **Usar diseño del editor** para añadir la composición actual con sus medidas físicas. Las imágenes importadas reciben un tamaño inicial que puedes ajustar.
3. Selecciona y arrastra cada diseño; arrastra su esquina inferior para cambiar el tamaño proporcionalmente o el control ↻ para girarlo libremente. También puedes introducir el giro en grados, usar el botón de 90°, cambiar posición y medidas, duplicar o eliminar. **Distribuir automáticamente** organiza los diseños en filas usando el rectángulo que los contiene ya girados; si no caben, conserva la distribución anterior.
   Para medir únicamente el área del arte, usa **Recorte automático** para eliminar márgenes transparentes, o **Recorte manual** para seleccionar el área arrastrando o introducir sus coordenadas en píxeles. El recorte mantiene la escala física del contenido; ajusta después el ancho o alto en centímetros si deseas otro tamaño final. El automático conserva cualquier píxel con transparencia parcial y no elimina fondos opacos. El recorte reemplaza la imagen de esa copia en la mesa.
4. El resumen muestra la longitud ocupada y el porcentaje de área de los rectángulos de diseño, no la cobertura real de tinta. Corrige los avisos de diseños fuera de la hoja o de separación insuficiente antes de exportar.
5. Selecciona fondo **Transparente** o **Blanco** en la hoja. **Exportar PNG** y **Exportar PDF** generan la hoja completa con ese fondo. El PNG incluye metadatos DPI; el PDF conserva las medidas físicas de la hoja y sus imágenes son raster sin pérdida. La exportación admite hasta 16.000 píxeles por lado y 64 megapíxeles. Usa **Guardar mesa** y **Abrir mesa guardada** para recuperar una copia editable después de recargar; cada guardado reemplaza la copia anterior en este navegador.

## Separación de colores para serigrafía

1. Abre **Serigrafía**, carga un PNG, JPG o WebP o usa el diseño del editor. Selecciona de 2 a 12 tintas y pulsa **Separar colores**. Opcionalmente, **Quitar fondo blanco** elimina todos los píxeles casi blancos, incluidos los del interior del diseño.
2. Alterna entre el original, todas las tintas y la tinta seleccionada. En el panel derecho puedes seleccionar tintas, mostrarlas u ocultarlas, cambiar sus colores, combinarlas o eliminarlas. Las zonas de una tinta eliminada quedan transparentes.
3. Activa el pincel y elige punta redonda, cuadrada o borrador. Pinta sobre el diseño para reasignar zonas a la tinta seleccionada; el borrador retira tinta y puedes recuperarla pintando de nuevo. Los ajustes de cantidad y fondo se aplican al volver a separar; esa operación reemplaza las ediciones.
4. **Guardar proyecto** conserva una copia editable en el navegador, con el diseño, las tintas y las ediciones; **Abrir proyecto guardado** la recupera incluso después de recargar. Un nuevo guardado reemplaza esa copia local. **Descargar PNG** guarda las tintas visibles en un solo archivo transparente, a la resolución de análisis.
5. La separación es una previsualización raster basada en agrupación de colores, con análisis de hasta 1600 px por lado. La exportación de positivos, las marcas de registro, los semitonos por tinta y la base blanca todavía no están incluidos.

## Estudio de piedrería

1. Abre **Piedrería**, configura el área en centímetros y elige tamaño SS, color y separación. Los diámetros SS6, SS10, SS16 y SS20 son aproximados: comprueba los de tu proveedor.
2. Usa **Pincel** para colocar una piedra o seguir una curva; **Línea**, **Rectángulo** y **Elipse** distribuyen piedras a intervalos regulares. Con **Seleccionar**, arrastra piedras; mantén Mayús para seleccionar varias. Puedes aplicar tamaño y color o eliminar la selección.
3. Carga una imagen o usa el diseño del editor. Si el lienzo está vacío, se crea automáticamente una propuesta sobre el contorno aproximado de sus zonas oscuras. También puedes usar **Crear diseño automáticamente**, cuadrícula o filas alternadas y ajustar el umbral. Las distribuciones se añaden a las piedras existentes; el aviso de bordes rojos indica piedras superpuestas o demasiado próximas.
4. Comprueba el resultado en fondo claro, oscuro o una vista ilustrativa en camiseta. Esta vista de camiseta es una referencia 2D y no representa una calibración física de la prenda.
5. **Guardar proyecto** conserva una copia editable en el navegador; otro guardado la reemplaza. **Plantilla SVG** y **Plantilla PDF** incluyen círculos negros a escala, sin la imagen de referencia. El PDF es raster a 150 DPI y tiene un límite de 24 megapíxeles. Imprime a tamaño real/100 % y verifica la escala con una regla antes de usar la plantilla. El diseño permite hasta 6000 piedras.

## Plantillas publicitarias

1. Abre **Plantillas** y elige una de las seis tarjetas: camiseta en percha, tres modelos y vistas de frente/espalda. Se utilizan los cinco PNG originales del proyecto; la imagen doble se encuadra por separado sin modificar su archivo. La plantilla inicial es la fotografía de la camiseta en percha.
2. Las camisetas de la galería ya tienen selección de prenda. Elige uno de los doce colores o un color personalizado; **Restaurar color original** recupera la fotografía. Se conserva la iluminación. El fondo de la foto se mantiene y el color de fondo de la publicación llena sus márgenes. Puedes mostrar la foto completa o llenar el encuadre.
3. Para otras prendas, incluidos buzos, usa **Cargar mi fotografía**, **Seleccionar prenda** y los pinceles **Añadir área** / **Quitar área**. La selección manual es aproximada y puede necesitar correcciones. Cambiar formato o encuadre reinicia esa selección. También siguen disponibles las ilustraciones anteriores.
4. Carga PNG/JPG/WebP o usa el diseño del editor. Arrastra, cambia tamaño sin deformar la proporción, gira, duplica y ordena cada elemento. Los acabados DTF, serigrafía, sublimación, vinilo, bordado y piedrería son simulaciones visuales para publicidad, no archivos de producción. Puedes importar resultados PNG preparados en los otros módulos.
5. Añade texto de varias líneas, elige fuente, negrita y color. **Vista limpia** oculta la selección y desactiva el arrastre hasta salir de ese modo. **Deshacer/Rehacer** conserva hasta 30 cambios; arrastrar produce un solo cambio y Escape cancela el movimiento.
6. **Guardar plantilla** conserva una copia editable en el navegador; un nuevo guardado reemplaza la anterior. **Descargar imagen PNG** crea una publicación de 1080 × 1350, 1080 × 1080 o 1080 × 1920 píxeles con los mismos elementos y acabados de la vista previa, sin controles de selección. La calidad fotográfica depende de la resolución de cada original.

## Video del simulador 3D

En **Simulador 3D**, ajusta el modelo, el diseño y el encuadre; luego elige la duración y el formato en **Video 360°** y pulsa **Crear y descargar video 360°**. La cámara completa una vuelta alrededor de la prenda y al terminar se recupera la vista anterior. Puedes cancelar durante la grabación. Mantén la aplicación visible hasta que termine: cambiar de pestaña o minimizarla interrumpe el proceso. El video usa la resolución de la vista 3D y no incluye sonido. Los formatos WebM y MP4 se ofrecen según el soporte del navegador; no todos los dispositivos admiten ambos.

## Vectorizar una imagen

1. Abre **Vectorización**. Usa **Cargar imagen** (PNG, JPG o WebP) o **Usar diseño del editor** para traer la composición actual con sus medidas.
2. Elige un preajuste o ajusta colores, detalle, simplificación y limpieza. **Ilustración detallada** analiza hasta 2048 px y usa hasta 16 colores; para dibujos pixelados prueba también **Redondear curvas**, comprobando que no modifique letras o esquinas. En monocromo puedes cambiar el umbral e invertir la selección tonal. **Quitar blanco** elimina las áreas blancas de toda la imagen.
3. Pulsa **Vectorizar**. El trazado se ejecuta en un Web Worker con progreso y cancelación; los cambios de ajustes se aplican al volver a vectorizar.
4. Compara **Original**, **Vector**, **Comparar** y **Contornos**. Selecciona un color para cambiarlo, ocultarlo o eliminarlo. **Redondear curvas** convierte las esquinas en curvas cuadráticas; desactívalo para preservar letras y ángulos.
5. Activa **Editar nodos** y selecciona un color. Arrastra los nodos, usa las flechas del teclado (Mayús: 10 unidades), inserta un nodo entre dos existentes o elimina uno. Escape cancela un movimiento. Cada contorno necesita al menos tres nodos.
6. Define ancho o alto en cm; las proporciones permanecen vinculadas. **Descargar SVG** conserva los trazados y las medidas. **Descargar PNG** rasteriza al DPI elegido o en modo **8K** (7680 píxeles en el lado mayor), con transparencia y metadatos de resolución calculados a partir de las medidas físicas.
7. **Añadir PNG al editor** coloca una copia rasterizada con las mismas medidas; el SVG editable se conserva en Vectorización. El guardado local permite recuperar el trabajo al volver al módulo o recargar.

El historial de vectorización es independiente del editor y permite deshacer/rehacer 20 cambios. Volver a vectorizar reemplaza las ediciones manuales del resultado; esta operación se puede deshacer.

La vista se ajusta al espacio disponible y el zoom escala tanto al acercar como al alejar. En comparación, el original y el vector usan marcos iguales. Un aviso identifica los ajustes todavía sin aplicar; **Restablecer ajustes** recupera los valores iniciales sin borrar el resultado. Antes de descargar se muestran las dimensiones exactas del PNG. Su rasterización utiliza directamente los píxeles solicitados, evitando ampliar una imagen intermedia de menor resolución.

Un clic de selección sobre un nodo no crea cambios en el historial. Las flechas mantenidas se agrupan hasta soltar la tecla y cambiar de vista cancela los movimientos pendientes. Los colores ocultos no admiten edición de nodos. Los trabajos guardados se validan antes de abrirse; si están dañados se informa del problema sin reemplazarlos automáticamente por un documento vacío.

El motor está orientado a logos, ilustraciones y colores planos. Las fotografías se convierten en áreas de color; no es un trazado mediante IA ni una preparación automática para máquinas de corte. El análisis usa hasta 2048 px en el lado mayor; los trazados SVG pueden escalarse después. La resolución alta no recupera detalles ausentes de la imagen original. La transparencia se convierte en un corte por umbral de alfa, no en degradados. La limpieza también elimina huecos pequeños; usa 0 para conservarlos. La edición visual de nodos se limita a 1500 nodos por color y el resultado total a 60.000 nodos para limitar el consumo de memoria.

El PNG descargado admite hasta 8192 px por lado y 64 megapíxeles; el modo 8K utiliza 7680 px en el lado mayor. A tamaños físicos muy pequeños, 8K puede requerir más de 10.000 DPI y se rechaza: aumenta las medidas físicas. La copia para el editor se limita a 4096 px por lado y 12 megapíxeles, conservando sus medidas físicas. El SVG no contiene imágenes incrustadas ni necesita esos límites de resolución.

## Ejecución

En **Configuración** puedes definir el guardado automático del editor, la sección inicial, las medidas y DPI de los documentos nuevos, el fondo de vista y los valores predeterminados de DTF. Los ajustes se guardan en el navegador. Si desactivas el guardado automático, usa **Guardar proyecto** en el editor. Para aplicar los valores DTF a una mesa ya abierta, pulsa **Aplicar valores DTF predeterminados**; revisa las posiciones después de cambiar las medidas.

```bash
npm install
npm run dev
npm test
npm run build
```

Para probar desde un teléfono conectado a la misma red que el computador, ejecuta `npm run dev -- --host 0.0.0.0` y abre en el teléfono la dirección de red que muestra Vite. El editor se adapta a pantallas pequeñas; los proyectos locales de cada navegador son independientes y no se sincronizan entre dispositivos.

## Instalar en celular o computadora

### Versión 0.4.1 y plataformas Apple

- Android: `installers/Stamprint-Studio-0.4.1-Android.apk` es una compilación de prueba firmada con la clave de desarrollo local.
- iPhone/iPad: el proyecto nativo está en `ios/App/App.xcodeproj`, sincronizado con la aplicación actual. En un Mac, instala Node.js, Xcode y las herramientas de línea de comandos de Xcode; ejecuta `npm ci` y `npm run open:ios` desde la raíz del proyecto. Selecciona un equipo de firma y compila/prueba en Xcode. Para instalar en un dispositivo o distribuir se necesita la firma y los permisos correspondientes de Apple. El proyecto no se ha compilado ni probado en iOS.
- macOS: en un Mac, ejecuta `npm ci` y `npm run build:mac` para generar paquetes DMG y ZIP para Intel y Apple Silicon en `installers/mac`. La firma y notarización requieren credenciales de Apple. La versión nativa de macOS no se ha compilado ni probado.
- Web: `installers/Stamprint-Studio-0.4.1-Web.zip` contiene el sitio compilado, no un instalador nativo. Descomprímelo y publica su contenido en un servidor HTTPS; en iPhone abre la dirección con Safari y selecciona Compartir → Añadir a pantalla de inicio. En Mac abre la dirección en un navegador compatible. No hay una URL publicada incluida.

### Instaladores nativos

La versión actual es **0.4.2, compilación nativa 6**. Incluye el código y los recursos actuales del proyecto, sin actualizar arbitrariamente sus dependencias.

- **Windows x64:** `installers/windows-0.4.2/Stamprint-Studio-0.4.2-Windows.exe`. Instalador NSIS, sin firma de editor.
- **Android:** `installers/Stamprint-Studio-0.4.2-Android.apk`. APK de desarrollo para Android 7 o superior; conserva el identificador y la clave local para actualizar la instalación anterior cuando esta usa la misma firma. No es un paquete de publicación en Google Play.
- **macOS e iOS:** `installers/Stamprint-Studio-0.4.2-Apple-Proyecto.zip`. Código y proyecto Xcode sincronizados, con instrucciones en `LEEME-APPLE.md`. Se deben compilar en un Mac; este ZIP no es un DMG ni un IPA instalable.
- **Web/PWA:** `installers/Stamprint-Studio-0.4.2-Web.zip`. Para alojar en HTTPS y utilizar desde los cuatro sistemas.

Android y Windows incluyen los recursos del simulador, plantillas y editor para uso local. Las exportaciones de Android/iOS usan el menú nativo para guardar o compartir. Los proyectos del navegador no se trasladan automáticamente a la aplicación nativa. Instala las actualizaciones sobre la misma aplicación para conservar sus datos locales; desinstalar o borrar sus datos puede eliminarlos.

Comandos de compilación:

```bash
npm ci
npm test
npm run build:windows
npm run build:android
npm run package:web
npm run package:apple
```

Android requiere Java 21 y el SDK Android 36. `npm run build` sincroniza la versión de `package.json` y `nativeBuildNumber` con Android e iOS. `dist/build-info.json` identifica los recursos compilados.

En un Mac con Xcode: `npm run build:mac` produce DMG/ZIP para Intel y Apple Silicon; `npm run build:ios` genera una app para el simulador. `npm run open:ios` abre Xcode para configurar tu equipo y probar en un iPhone. `npm run build:ios:archive` requiere `APPLE_TEAM_ID` y la firma ya configurada. Ningún comando publica automáticamente. Instrucciones completas: [Preparar Apple](docs/APPLE.md).

### Versión web instalable

Ejecuta `npm run build` y publica el contenido de `dist` en un servidor HTTPS. Abre la dirección publicada en cada dispositivo:

- **Android:** en Chrome, abre el menú y selecciona **Instalar aplicación** o **Añadir a pantalla de inicio**.
- **iPhone/iPad:** en Safari, pulsa **Compartir** y luego **Añadir a pantalla de inicio**.
- **Windows/macOS:** en Chrome o Edge, usa el botón de instalación de la barra de direcciones o la opción **Instalar aplicación** del menú.

Una vez cargada por primera vez, la aplicación instalada puede abrirse sin conexión. El almacenamiento y los proyectos son locales a cada navegador y dispositivo. La instalación y el funcionamiento sin conexión requieren HTTPS (o `localhost` para pruebas); la dirección de red HTTP de Vite sirve para probar la interfaz, pero no para instalarla. Si se publica una nueva versión, cierra y vuelve a abrir la aplicación para cargarla.

## Límites actuales

Los módulos de IA local, técnicas de impresión restantes, gestión comercial y Tauri aún no están implementados. No se presentan como funciones terminadas.

La importación limita los recursos a 4096 px por lado y 12 megapíxeles; la mejora admite hasta 4096 × 4096 px. El documento admite hasta 6000 px por lado y 24 megapíxeles. La vista del editor usa recursos reducidos para responder al arrastre; la exportación utiliza la resolución completa disponible. El almacenamiento de carpetas nativas, OPFS, proyectos `.stamprint` y SQLite no está incluido.

Las pruebas de píxeles y de exportación utilizan `@napi-rs/canvas` como dependencia de desarrollo; no forma parte de la aplicación del navegador. Estas pruebas no sustituyen la verificación visual de la interfaz.

## Privacidad y dependencias

No hay cuentas, telemetría, API externa ni procesamiento remoto. La aplicación funciona con APIs locales del navegador (`Canvas` e `IndexedDB`). Antes de añadir OpenCV, ONNX, modelos de IA, motores ICC o dependencias de exportación, se debe revisar de forma individual su licencia y la licencia del modelo para distribución comercial.
