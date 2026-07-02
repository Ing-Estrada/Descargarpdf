# Ficha de tienda — PDF Grabber (textos listos para pegar)

Material para publicar en Chrome Web Store, Microsoft Edge Add-ons y Opera Add-ons.

---

## Nombre

```
PDF Grabber
```

## Descripción breve (máx. 132 caracteres — Chrome)

```
Descarga PDFs que el navegador ya muestra, aunque la página oculte el botón. Detecta iframe, blob, fetch, PDF.js y más.
```

## Descripción detallada

```
PDF Grabber te ayuda a descargar documentos PDF que tu navegador ya ha recibido y
puede visualizar, incluso cuando la página no ofrece un botón de descarga.

CÓMO FUNCIONA
La extensión detecta automáticamente el PDF de la pestaña y te permite guardarlo
con un clic. Reconoce múltiples formas de carga:
• PDF incrustado en iframe, object o embed
• PDF servido desde un Blob o una data URL
• PDF cargado por fetch o XMLHttpRequest
• Visor nativo del navegador y visores PDF.js / Mozilla
• Enlaces directos a archivos .pdf

CARACTERÍSTICAS
• Detección automática con contador en el icono
• Descarga fiable respetando tu sesión y cookies del sitio
• Nombre de archivo sugerido (desde la cabecera, la URL o el título) y patrón configurable
• Menú contextual "Descargar PDF"
• Panel de diagnóstico con el detalle de cada intento
• Modo claro y oscuro

PRIVACIDAD
Todo el procesamiento ocurre en tu equipo. La extensión NO recopila datos, NO
usa servidores externos y NO envía ninguna información. Solo guarda tus
preferencias localmente.

LÍMITES (importante)
PDF Grabber solo recupera documentos que el navegador ya recibió y puede mostrar.
NO rompe autenticación, DRM, cifrado ni protecciones del servidor. Si un PDF está
protegido por DRM o nunca llega completo al navegador, no es técnicamente
recuperable, y la extensión te lo indicará.

Úsala únicamente con documentos a los que tengas acceso legítimo.
```

## Categoría sugerida
Productividad / Herramientas

## Idioma principal
Español

## Enlaces
- Política de privacidad: `https://github.com/Ing-Estrada/Descargarpdf/blob/main/PRIVACY.md`
- Sitio / soporte: `https://github.com/Ing-Estrada/Descargarpdf`

---

## Justificación de permisos (Chrome pide una por cada uno)

| Permiso | Justificación para pegar |
|---------|--------------------------|
| `activeTab` | Interactuar con la pestaña activa cuando el usuario abre el popup para detectar y descargar el PDF que está viendo. |
| `tabs` | Leer la URL y el título de la pestaña activa para detectar PDFs y sugerir el nombre del archivo. |
| `scripting` | Refrescar la detección de PDFs en la página a petición del usuario. |
| `downloads` | Guardar el PDF en el equipo del usuario mediante el gestor de descargas del navegador. |
| `storage` | Guardar las preferencias del usuario (tema, patrón de nombre, ajustes). |
| `contextMenus` | Añadir la opción "Descargar PDF" al menú del clic derecho. |
| `offscreen` | Crear object URLs a partir de los bytes del PDF; el service worker de MV3 no dispone de esa API del DOM. |
| **Host permissions** (`<all_urls>`) | Un PDF puede estar servido desde cualquier dominio; se necesita acceso amplio para detectar y obtener el documento que el usuario visualiza. No se transmite ningún dato fuera del navegador. |
| **Uso de código remoto** | Ninguno. Todo el código se incluye en el paquete; no se descarga ni se ejecuta código remoto. |

## Declaración de uso de datos (Chrome "Data safety")
- ¿Recopila datos de usuario? **No.**
- Marca la casilla de que **no se vende ni transfiere** información a terceros.
- Marca las certificaciones de cumplimiento de las políticas del programa para desarrolladores.

---

## Recursos gráficos que debes preparar tú

- **Icono de tienda 128×128**: ya incluido (`icons/icon128.png`).
- **Capturas de pantalla**: al menos 1 (recomendado 3–5). Tamaño 1280×800 o 640×400 PNG/JPG.
  Sugerencia: captura el popup con PDFs detectados y el panel de diagnóstico abierto.
- **Imagen promocional pequeña** (opcional) 440×280.
```
