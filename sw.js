// Service worker de Entrena: un programa pequeño que el navegador deja instalado y que guarda
// una copia de los archivos de la app. Con esa copia la app abre en modo avión.
//
// Solo guarda los archivos publicados (la app y el catálogo). Las imágenes, las sesiones y todo
// lo demás viven en el dispositivo (IndexedDB) y no pasan por aquí (sección 9).
//
// VERSION y ARCHIVOS no se escriben a mano: los pone `npm run sellar`. La versión es una huella
// del contenido de los archivos: si cambia cualquiera, cambia la versión, el navegador instala
// la copia nueva entera y borra la vieja. Así no se mezclan archivos viejos con nuevos.

const VERSION = '810337ba65ba';
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'ejercicios.json',
  'ejemplo-sesion.json',
  'css/estilos.css',
  'js/almacen.js',
  'js/app.js',
  'js/botonera.js',
  'js/catalogo.js',
  'js/config.js',
  'js/dom.js',
  'js/duracion.js',
  'js/microfono.js',
  'js/motor.js',
  'js/numeros.js',
  'js/pantallas/ajustes.js',
  'js/pantallas/fin.js',
  'js/pantallas/indice.js',
  'js/pantallas/inicio.js',
  'js/pantallas/microfono.js',
  'js/pantallas/reproductor.js',
  'js/pantallas/rutinas.js',
  'js/pantallas/sesion.js',
  'js/prueba-de-sonido.js',
  'js/sonido.js',
  'js/textos.js',
  'js/voz.js',
  'iconos/icono-180.png',
  'iconos/icono-192.png',
  'iconos/icono-512.png',
];

const PREFIJO = 'entrena-';
const COPIA = `${PREFIJO}${VERSION}`;

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(COPIA)
      // «reload»: cada archivo se pide a la red de verdad, saltándose la copia rápida del navegador.
      .then((copia) => copia.addAll(ARCHIVOS.map((ruta) => new Request(ruta, { cache: 'reload' }))))
      // Si falta un solo archivo, la instalación falla entera y sigue valiendo la copia anterior.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres.filter((nombre) => nombre.startsWith(PREFIJO) && nombre !== COPIA).map((nombre) => caches.delete(nombre)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function responder(peticion) {
  const copia = await caches.open(COPIA);
  const guardada = await copia.match(peticion, { ignoreSearch: true });
  if (guardada) return guardada;
  // Abrir la app (con cualquier dirección dentro de ella) sirve siempre la página principal.
  if (peticion.mode === 'navigate') {
    const pagina = await copia.match('index.html');
    if (pagina) return pagina;
  }
  return fetch(peticion);
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;
  // Solo se atiende lo de la propia app; cualquier otra cosa sigue su camino normal.
  if (new URL(peticion.url).origin !== self.location.origin) return;
  evento.respondWith(responder(peticion));
});
