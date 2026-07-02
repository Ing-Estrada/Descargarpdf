# Política de privacidad — PDF Grabber

_Última actualización: 2 de julio de 2026_

PDF Grabber es una extensión de navegador que permite descargar documentos PDF
que el navegador ya ha recibido y puede visualizar. Esta política explica qué
datos maneja y, sobre todo, qué **no** hace.

## Resumen

**PDF Grabber no recopila, almacena en servidores ni transmite ningún dato
personal ni de navegación.** Todo el procesamiento ocurre localmente en tu
navegador.

## Datos que la extensión procesa (localmente)

- **Contenido de la página que estás viendo.** Para detectar PDFs, la extensión
  analiza el DOM y observa las peticiones de red (`fetch`/`XMLHttpRequest`) de la
  pestaña activa. Este análisis se realiza **exclusivamente en tu dispositivo** y
  solo con el fin de localizar y descargar el PDF que tú eliges. Ese contenido
  nunca se envía a ningún sitio.
- **Bytes del PDF.** Cuando pulsas "Descargar", la extensión obtiene los bytes
  del documento (de la memoria del navegador o mediante una petición con tu
  propia sesión) y los guarda en tu equipo a través del gestor de descargas del
  navegador. No se copian a ningún servidor externo.

## Datos que la extensión almacena

- **Tus preferencias** (tema claro/oscuro, patrón de nombre de archivo y ajustes
  de diagnóstico) se guardan mediante `chrome.storage.sync`. Si tienes la
  sincronización de Chrome activada, estas preferencias pueden sincronizarse
  entre tus propios dispositivos a través de tu cuenta de Google. **El
  desarrollador no tiene acceso a estos datos.**

## Datos que la extensión NO hace

- No recopila información de identificación personal.
- No rastrea tu actividad de navegación.
- No envía datos a servidores del desarrollador ni a terceros.
- No utiliza servicios de analítica ni publicidad.
- No vende ni comparte datos con nadie.

## Permisos y su finalidad

- `activeTab`, `tabs`, `scripting`: detectar el PDF en la pestaña que estás viendo.
- `downloads`: guardar el archivo en tu equipo.
- `storage`: recordar tus preferencias.
- `contextMenus`: añadir la opción "Descargar PDF" al menú del clic derecho.
- `offscreen`: convertir los bytes del PDF en un archivo descargable.
- `host_permissions` (`<all_urls>`): un PDF puede estar en cualquier sitio web;
  este acceso permite detectarlo y obtenerlo. **No implica ninguna transmisión de
  datos fuera de tu navegador.**

## Contacto

Para consultas sobre esta política, abre una incidencia en el repositorio del
proyecto: <https://github.com/Ing-Estrada/Descargarpdf>

## Cambios

Cualquier cambio en esta política se publicará en este mismo archivo dentro del
repositorio del proyecto.
