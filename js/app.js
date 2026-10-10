// Arranque de la app: carga el catálogo, abre lo guardado en el dispositivo y enseña la primera pantalla.

import { abrirAlmacen } from './almacen.js';
import { cargarCatalogo } from './catalogo.js';
import { h, pantalla, poner } from './dom.js';
import { pantallas } from './pantallas/indice.js';
import { crearSonido } from './sonido.js';
import { crearVoz } from './voz.js';

const raiz = document.getElementById('app');
let alSalir = null;

function montar(resultado) {
  // Una pantalla puede devolver solo su nodo, o el nodo y una función de limpieza.
  const nodo = resultado instanceof Node ? resultado : resultado.nodo;
  alSalir = resultado instanceof Node ? null : (resultado.alSalir ?? null);
  poner(raiz, nodo);
}

let pantallaActual = null;
let hayVersionNueva = false;

// Cambia de pantalla. Si la pantalla no necesita esperar a nada (el reproductor), se monta
// en el acto: así la voz puede arrancar dentro del mismo toque (sección 9).
function ir(nombre, datos = {}) {
  alSalir?.();
  alSalir = null;
  // Si ha llegado una versión nueva de la app, se estrena al volver al inicio:
  // nunca en mitad de una sesión.
  if (hayVersionNueva && nombre === 'inicio') {
    location.reload();
    return Promise.resolve();
  }
  pantallaActual = nombre;
  try {
    const resultado = pantallas[nombre](app, datos);
    if (resultado instanceof Promise) return resultado.then(montar).catch(mostrarError);
    montar(resultado);
  } catch (error) {
    mostrarError(error);
  }
  return Promise.resolve();
}

function mostrarError(error) {
  console.error(error);
  poner(
    raiz,
    pantalla({
      cabecera: [h('h1', {}, 'Entrena')],
      contenido: [
        h('p', { class: 'aviso aviso-peligro' }, 'Algo ha fallado.'),
        h('p', { class: 'suave' }, String(error?.message ?? error)),
        h(
          'p',
          { class: 'suave pequeno' },
          'Si has abierto la app con doble clic en el archivo, no funciona así: mira el archivo LEEME.md.',
        ),
      ],
      pie: [h('button', { class: 'boton', onclick: () => location.reload() }, 'Reintentar')],
    }),
  );
}

// Las imágenes están guardadas en el dispositivo. Aquí se recuerda la dirección interna de cada una
// para no leerla del almacén cada vez que se pinta la tarjeta.
const direcciones = new Map();

const app = {
  ir,
  catalogo: null,
  almacen: null,
  ajustes: null,
  ejemplo: null,
  voz: crearVoz(),
  sonido: crearSonido(),
  async urlDeImagen(id) {
    if (!direcciones.has(id)) {
      const imagen = await app.almacen.imagen(id);
      direcciones.set(id, imagen ? URL.createObjectURL(imagen) : null);
    }
    return direcciones.get(id);
  },
  // Lo que ya se sabe de una imagen sin esperar: su dirección, null si el ejercicio no tiene
  // imagen, o undefined si aún no se ha mirado.
  imagenEnMemoria: (id) => direcciones.get(id),
  // Deja miradas las imágenes de una lista de ejercicios, para pintar la tarjeta de una vez.
  prepararImagenes: (ids) => Promise.all(ids.map((id) => app.urlDeImagen(id))),
  olvidarImagenes() {
    for (const direccion of direcciones.values()) if (direccion) URL.revokeObjectURL(direccion);
    direcciones.clear();
  },
};

async function leerEjemplo() {
  try {
    const respuesta = await fetch('ejemplo-sesion.json');
    return respuesta.ok ? await respuesta.json() : null;
  } catch {
    return null;
  }
}

// El service worker guarda una copia de la app para que abra en modo avión (sección 9).
// En el Mac (localhost) no se instala, para no mezclar versiones mientras se programa;
// se puede forzar añadiendo «?sw=1» a la dirección, para probarlo.
function instalarCopiaSinConexion() {
  if (!('serviceWorker' in navigator)) return;
  const enElMac = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (enElMac && !new URLSearchParams(location.search).has('sw')) return;
  const yaHabiaUna = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!yaHabiaUna) return; // primera instalación: no hay nada que estrenar
    hayVersionNueva = true;
    if (pantallaActual === 'inicio') location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch((error) => console.error(error));
}

// Pide al navegador que no borre los datos de la app por su cuenta (5.6).
// Si el iPhone lo concede o no, se ve en Ajustes.
function pedirAlmacenamientoPersistente() {
  navigator.storage?.persist?.().catch(() => {});
}

async function arrancar() {
  [app.catalogo, app.almacen, app.ejemplo] = await Promise.all([cargarCatalogo(), abrirAlmacen(), leerEjemplo()]);
  // Los interruptores de voz y sonido parten de los valores del catálogo (`ajustes`).
  app.ajustes = await app.almacen.leerAjustes({
    voz: app.catalogo.ajustes.voz,
    sonido: app.catalogo.ajustes.sonido,
  });
  app.voz.activar(app.ajustes.voz);
  app.voz.elegir(app.ajustes.vozElegida ?? null);
  app.sonido.activar(app.ajustes.sonido);
  await ir('inicio');
  instalarCopiaSinConexion();
  pedirAlmacenamientoPersistente();
}

arrancar().catch(mostrarError);
