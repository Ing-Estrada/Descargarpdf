# PDF Grabber

Extensión para navegadores basados en Chromium (Chrome, Brave, Edge, Opera, Vivaldi)
que permite **descargar documentos PDF que el navegador ya recibió y puede visualizar**,
incluso cuando la página no ofrece un botón de descarga.

> **Alcance ético y técnico.** Esta extensión sólo aprovecha recursos que el navegador
> **ya descargó** y puede mostrar de forma legítima. **No** rompe autenticación, sesiones,
> DRM, cifrado ni protecciones del servidor. Si un PDF está protegido por DRM o nunca
> llega completo al navegador (por ejemplo, se renderiza bajo demanda con protección),
> la extensión te informará de que **no es técnicamente recuperable** mediante las APIs
> permitidas a una extensión.

---

## Características

- **Detección automática** de PDFs en la pestaña:
  `application/pdf`, `blob:`, `data:`, `<object>`, `<embed>`, `<iframe>`, enlaces `.pdf`,
  visor nativo de Chromium, PDF.js / visor de Mozilla y PDFs cargados por librerías JS.
- **Interceptación de red** en el mundo principal: envuelve `fetch`, `XMLHttpRequest` y
  `URL.createObjectURL` para capturar PDFs entregados dinámicamente.
- **Descarga robusta** según el origen del recurso:
  - `http(s)` → validación de firma `%PDF-` y descarga (respeta tu sesión/cookies).
  - `blob:` → los bytes se leen en el contexto de la página y se materializan vía
    documento *offscreen*.
  - `data:` → se decodifica localmente.
- **Nombre sugerido** desde `Content-Disposition`, la URL, el título del documento o la
  fecha, con un patrón configurable.
- **Menú contextual** "Descargar PDF" sobre enlaces, imágenes, iframes y el visor.
- **Popup moderno** con tipo de carga, tamaño, nombre sugerido y acciones
  (Descargar / Copiar URL / Abrir en pestaña).
- **Panel de diagnóstico** con URL, método, estado y errores de cada intento.
- **Modo claro / oscuro / automático**, responsive y con animaciones suaves.

---

## Arquitectura

```
src/
├── background/    Service worker: registro por pestaña, menú, orquestación de descargas
├── content/       Content script (mundo aislado): detección DOM + puente
├── hooks/         Interceptor (mundo principal): fetch / XHR / createObjectURL
├── offscreen/     Documento oculto: crea object URLs (API que el worker no tiene)
├── popup/         Interfaz de usuario
├── options/       Página de ajustes
├── services/      detection, fetcher, downloader, registry, settings
├── utils/         logger, filename, base64, messaging
└── types/         Contrato de tipos y protocolo de mensajes
```

Se compila en **tres pases de Vite** porque MV3 mezcla contextos de módulo:

| Pase | Salida | Contenido |
|------|--------|-----------|
| `build:main` | ES modules | service worker, offscreen, popup, options |
| `build:content` | IIFE | content script (mundo aislado) |
| `build:interceptor` | IIFE | interceptor (mundo principal) |

Los content scripts deben ser IIFE autocontenidos (sin `import`/`export`), mientras que
el worker y las páginas son módulos ES reales.

---

## Requisitos

- **Node.js 18 o superior** (recomendado 20+). Descárgalo en <https://nodejs.org>.
  Comprueba la instalación con:
  ```bash
  node --version
  npm --version
  ```

---

## Instalación y compilación

```bash
# 1. Instalar dependencias
npm install

# 2. Compilación de producción (genera iconos + tres pases + copia estáticos)
npm run build
```

El resultado queda en **`dist/`**, listo para cargar como extensión sin empaquetar.

Otros comandos:

```bash
npm run dev        # Compilación en modo watch (recarga la extensión manualmente)
npm run typecheck  # Verificación de tipos con TypeScript
npm run icons      # Regenera los iconos PNG
npm run package    # Crea pdf-grabber-vX.Y.Z.zip a partir de dist/
```

---

## Instalación manual en el navegador

La carpeta a cargar siempre es **`dist/`** (no la raíz del proyecto).

### Google Chrome
1. Abre `chrome://extensions`.
2. Activa el **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** y selecciona la carpeta `dist/`.

### Brave
1. Abre `brave://extensions`.
2. Activa el **Modo de desarrollador**.
3. **Cargar sin empaquetar** → selecciona `dist/`.

### Microsoft Edge
1. Abre `edge://extensions`.
2. Activa **Modo de desarrollador** (barra lateral izquierda).
3. **Cargar desempaquetada** → selecciona `dist/`.

### Opera / Vivaldi
1. Abre `opera://extensions` o `vivaldi://extensions`.
2. Activa el **Modo de desarrollador**.
3. **Cargar sin empaquetar** → selecciona `dist/`.

> Tras cada `npm run build` o cambio en `npm run dev`, vuelve a la página de extensiones
> y pulsa **Actualizar/Recargar** en la tarjeta de PDF Grabber.

---

## Uso

1. Abre una página que muestre un PDF.
2. Haz clic en el icono de **PDF Grabber**: verás los PDFs detectados con su tipo y tamaño.
3. Pulsa **Descargar**. También puedes **Copiar URL** o **Abrir en pestaña**.
4. Alternativamente, clic derecho sobre el visor/enlace → **Descargar PDF**.
5. Si algo falla, abre el **panel de diagnóstico** del popup para ver el detalle.

---

## Permisos y por qué se solicitan

| Permiso | Uso |
|---------|-----|
| `downloads` | Guardar el PDF mediante el gestor de descargas del navegador. |
| `storage` | Guardar tus preferencias (tema, patrón de nombre, etc.). |
| `tabs` | Conocer la URL/título de la pestaña activa para detectar el PDF y sugerir el nombre. |
| `contextMenus` | Añadir la opción "Descargar PDF" al clic derecho. |
| `offscreen` | Crear object URLs desde el service worker (que no tiene DOM). |
| `host_permissions: <all_urls>` | Detectar y leer los bytes de PDFs ya accesibles en cualquier sitio, sin bloqueos CORS artificiales. |

No se usan servidores externos. No se envía ninguna información. Todo ocurre localmente.

---

## Limitaciones conocidas

- **DRM / documentos protegidos**: no recuperables por diseño.
- **PDFs paginados bajo demanda**: si el servidor entrega sólo fragmentos cifrados o
  imágenes por página, no existe un PDF completo que descargar.
- **Páginas restringidas** (`chrome://`, la Web Store, etc.): los navegadores no permiten
  inyectar content scripts, por lo que no hay detección ahí.
- **Content scripts en mundo MAIN** requieren Chromium 111+.

---

## Licencia

MIT.
