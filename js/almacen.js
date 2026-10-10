// Lo que la app guarda en el dispositivo, con IndexedDB (la base de datos del navegador).
// Nada de esto sale del dispositivo ni entra en git:
//   - `estado`:     ajustes de la app, la sesión a medias y otros datos sueltos;
//   - `sesiones`:   sesiones importadas (las de gimnasio);
//   - `imagenes`:   las imágenes de los ejercicios, por `id`;
//   - `misAjustes`: el texto de «Mis ajustes» de cada máquina, por `id` de ejercicio;
//   - `historial`:  las sesiones hechas, con sus series registradas.

import { erroresDeSesion, sesionesDeArchivo } from './catalogo.js';
import { CONFIG } from './config.js';

const NOMBRE = 'entrena';
const VERSION = 1;
const ALMACENES = {
  estado: {},
  sesiones: { keyPath: 'id' },
  imagenes: {},
  misAjustes: {},
  historial: { keyPath: 'numero', autoIncrement: true },
};

// «Puente.PNG» o «carpeta/puente.png» → «puente»: el `id` del ejercicio al que corresponde (5.7).
export function idDeArchivo(nombreDeArchivo) {
  const sinRuta = String(nombreDeArchivo).split(/[\\/]/).pop();
  return sinRuta.replace(/\.[^.]+$/, '').trim().toLowerCase();
}

// Reparte una lista de nombres de archivo entre los que casan con un ejercicio y los que no.
export function repartirImagenes(nombres, catalogo) {
  const asignadas = [];
  const sinCasar = [];
  for (const nombre of nombres) {
    const id = idDeArchivo(nombre);
    if (catalogo.buscar(id)) asignadas.push({ nombre, id });
    else sinCasar.push(nombre);
  }
  return { asignadas, sinCasar };
}

// Convierte una petición de IndexedDB en una promesa.
function pedir(peticion) {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

function abrirBase(fabrica, nombre) {
  return new Promise((resolver, rechazar) => {
    const peticion = fabrica.open(nombre, VERSION);
    peticion.onupgradeneeded = () => {
      const base = peticion.result;
      for (const [almacen, opciones] of Object.entries(ALMACENES)) {
        if (!base.objectStoreNames.contains(almacen)) base.createObjectStore(almacen, opciones);
      }
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
    peticion.onblocked = () => rechazar(new Error('La base de datos está abierta en otra pestaña.'));
  });
}

export async function abrirAlmacen({ fabrica = globalThis.indexedDB, nombre = NOMBRE } = {}) {
  if (!fabrica) throw new Error('Este navegador no permite guardar datos (IndexedDB).');
  const base = await abrirBase(fabrica, nombre);

  // Hace una operación sobre un almacén y espera a que la transacción termine de verdad.
  function operar(almacen, modo, accion) {
    return new Promise((resolver, rechazar) => {
      const transaccion = base.transaction(almacen, modo);
      let resultado;
      transaccion.oncomplete = () => resolver(resultado);
      transaccion.onerror = () => rechazar(transaccion.error);
      transaccion.onabort = () => rechazar(transaccion.error ?? new Error('Operación cancelada.'));
      Promise.resolve(accion(transaccion.objectStore(almacen))).then(
        (valor) => {
          resultado = valor;
        },
        (error) => {
          rechazar(error);
          try {
            transaccion.abort();
          } catch {
            // Ya estaba cerrada.
          }
        },
      );
    });
  }

  const leer = (almacen, clave) => operar(almacen, 'readonly', (a) => pedir(a.get(clave)));
  const leerTodo = (almacen) => operar(almacen, 'readonly', (a) => pedir(a.getAll()));
  const claves = (almacen) => operar(almacen, 'readonly', (a) => pedir(a.getAllKeys()));
  const escribir = (almacen, valor, clave) =>
    operar(almacen, 'readwrite', (a) => pedir(clave === undefined ? a.put(valor) : a.put(valor, clave)));
  const borrar = (almacen, clave) => operar(almacen, 'readwrite', (a) => pedir(a.delete(clave)));

  return {
    cerrar: () => base.close(),

    // ---- Ajustes de la app (interruptores de voz y sonido) ----
    async leerAjustes(porDefecto = {}) {
      return { ...porDefecto, ...((await leer('estado', 'ajustes')) ?? {}) };
    },
    guardarAjustes: (ajustes) => escribir('estado', ajustes, 'ajustes'),

    // ---- Datos sueltos ----
    leerDato: async (clave) => (await leer('estado', `dato:${clave}`)) ?? null,
    guardarDato: (clave, valor) => escribir('estado', valor, `dato:${clave}`),
    borrarDato: (clave) => borrar('estado', `dato:${clave}`),

    // ---- Sesión a medias, para «Seguir donde lo dejaste» ----
    sesionAMedias: async () => (await leer('estado', 'sesionAMedias')) ?? null,
    guardarSesionAMedias: (instantanea) => escribir('estado', instantanea, 'sesionAMedias'),
    borrarSesionAMedias: () => borrar('estado', 'sesionAMedias'),

    // ---- Sesiones importadas ----
    sesiones: () => leerTodo('sesiones'),
    sesion: async (id) => (await leer('sesiones', id)) ?? null,
    guardarSesion: (sesion) => escribir('sesiones', sesion),
    borrarSesion: (id) => borrar('sesiones', id),

    // ---- Imágenes ----
    imagen: async (id) => (await leer('imagenes', id)) ?? null,
    idsDeImagenes: () => claves('imagenes'),
    guardarImagen: (id, imagen) => escribir('imagenes', imagen, id),
    borrarImagenes: () => operar('imagenes', 'readwrite', (a) => pedir(a.clear())),

    // ---- «Mis ajustes» de cada máquina ----
    misAjustes: async (idEjercicio) => (await leer('misAjustes', idEjercicio)) ?? '',
    guardarMisAjustes(idEjercicio, texto) {
      const limpio = String(texto ?? '').trim();
      return limpio === '' ? borrar('misAjustes', idEjercicio) : escribir('misAjustes', limpio, idEjercicio);
    },

    // ---- Historial: sesiones hechas ----
    historial: () => leerTodo('historial'),
    // Devuelve el número con el que queda guardada, por si hay que quitarla después.
    guardarSesionHecha: (resumen) => escribir('historial', resumen),
    borrarSesionHecha: (numero) => borrar('historial', numero),
  };
}

// Importa un archivo de sesiones ya leído (como `sesiones-gimnasio.json`). Guarda las que se pueden
// reproducir y devuelve cuáles ha guardado y cuáles ha rechazado, con el motivo.
export async function importarSesiones(datos, catalogo, almacen) {
  const guardadas = [];
  const rechazadas = [];
  for (const sesion of sesionesDeArchivo(datos)) {
    const errores = erroresDeSesion(sesion, catalogo);
    if (errores.length > 0) {
      rechazadas.push({ titulo: sesion?.titulo ?? sesion?.id ?? 'Sin título', errores });
    } else {
      await almacen.guardarSesion(sesion);
      guardadas.push(sesion.titulo);
    }
  }
  return { guardadas, rechazadas };
}

// Importa imágenes: cada archivo se asigna al ejercicio que se llama igual (`puente.png` → `puente`).
// `reducir` deja la imagen en 1200 px de ancho como mucho; se pasa desde fuera para poder probar esto
// sin navegador. Las que no casan con ningún ejercicio se devuelven en `sinCasar`.
export async function importarImagenes(archivos, catalogo, almacen, reducir = reducirImagen) {
  const lista = Array.from(archivos);
  const { asignadas, sinCasar } = repartirImagenes(
    lista.map((archivo) => archivo.name),
    catalogo,
  );
  const fallidas = [];
  const guardadas = [];
  for (const { nombre, id } of asignadas) {
    const archivo = lista.find((a) => a.name === nombre);
    try {
      await almacen.guardarImagen(id, await reducir(archivo));
      guardadas.push(id);
    } catch {
      fallidas.push(nombre);
    }
  }
  return { guardadas, sinCasar, fallidas };
}

// Reduce una imagen a `anchoMaximo` píxeles de ancho como mucho (5.7). Solo funciona en el navegador.
export async function reducirImagen(archivo, anchoMaximo = CONFIG.anchoMaximoDeImagenPx) {
  const mapa = await createImageBitmap(archivo);
  try {
    if (mapa.width <= anchoMaximo) return archivo;
    const escala = anchoMaximo / mapa.width;
    const lienzo = document.createElement('canvas');
    lienzo.width = anchoMaximo;
    lienzo.height = Math.round(mapa.height * escala);
    lienzo.getContext('2d').drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
    const reducida = await new Promise((resolver) => lienzo.toBlob(resolver, 'image/png'));
    return reducida ?? archivo;
  } finally {
    mapa.close?.();
  }
}
