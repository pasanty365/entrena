// Catálogo de ejercicios y rutinas, y conversión de una sesión en la lista de pasos
// que sigue el reproductor. Funciones puras, salvo `cargarCatalogo`, que lee el archivo.

import { CONFIG } from './config.js';
import { cantidadDe, descansoDe, normalizarItem, segundosPorRepeticion } from './duracion.js';

// Prepara el catálogo a partir del contenido de `ejercicios.json`, sin cambiarlo.
export function crearCatalogo(datos) {
  const porId = new Map(datos.ejercicios.map((ejercicio) => [ejercicio.id, ejercicio]));
  return {
    version: datos.version,
    ajustes: datos.ajustes,
    categorias: datos.categorias,
    ejercicios: datos.ejercicios,
    rutinas: datos.rutinas,
    buscar: (id) => porId.get(id) ?? null,
  };
}

// Lee `ejercicios.json` del mismo sitio del que se sirve la app.
export async function cargarCatalogo(url = 'ejercicios.json') {
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`No se ha podido leer el catálogo (${respuesta.status}).`);
  return crearCatalogo(await respuesta.json());
}

// Una rutina libre se reproduce como una sesión de un solo bloque,
// con una serie de cada ejercicio y sin descansos (4.4).
export function rutinaComoSesion(rutina) {
  return {
    id: `rutina:${rutina.id}`,
    titulo: rutina.nombre,
    esRutina: true,
    fecha: null,
    lugar: null,
    motivo: '',
    avisos: [],
    alarma: false,
    bloques: [
      {
        tipo: 'rutina',
        ejercicios: rutina.ejercicios.map((item) => ({ ...normalizarItem(item), series: 1 })),
      },
    ],
    ejerciciosNuevos: [],
  };
}

// Un archivo de sesiones puede traer `{ sesiones: [...] }` (como `sesiones-gimnasio.json`),
// una lista de sesiones o una sola sesión. Devuelve siempre una lista.
export function sesionesDeArchivo(datos) {
  if (Array.isArray(datos)) return datos;
  if (datos && Array.isArray(datos.sesiones)) return datos.sesiones;
  if (datos && Array.isArray(datos.bloques)) return [datos];
  throw new Error('El archivo no tiene sesiones con el formato esperado.');
}

// Comprueba que una sesión se puede reproducir. Devuelve una lista de errores en castellano;
// vacía si todo está bien. Las reglas de seguridad de la sección 7 no se miran aquí (fase 3).
export function erroresDeSesion(sesion, catalogo) {
  const errores = [];
  if (!sesion || typeof sesion !== 'object') return ['La sesión no es un objeto.'];
  if (typeof sesion.id !== 'string' || sesion.id === '') errores.push('La sesión no tiene «id».');
  if (typeof sesion.titulo !== 'string' || sesion.titulo === '') {
    errores.push('La sesión no tiene «titulo».');
  }
  if (!Array.isArray(sesion.bloques) || sesion.bloques.length === 0) {
    errores.push('La sesión no tiene bloques.');
    return errores;
  }
  sesion.bloques.forEach((bloque, i) => {
    if (!Array.isArray(bloque.ejercicios) || bloque.ejercicios.length === 0) {
      errores.push(`El bloque ${i + 1} no tiene ejercicios.`);
      return;
    }
    for (const item of bloque.ejercicios.map(normalizarItem)) {
      const ejercicio = catalogo.buscar(item.id);
      if (!ejercicio) {
        errores.push(`El ejercicio «${item.id}» no está en el catálogo.`);
        continue;
      }
      const series = item.series ?? 1;
      if (!Number.isInteger(series) || series < 1) {
        errores.push(`«${item.id}»: el número de series no es válido.`);
      }
      for (const campo of ['repeticiones', 'segundos', 'descansoSegundos']) {
        const valor = item[campo];
        if (valor != null && !(Number.isFinite(valor) && valor > 0)) {
          errores.push(`«${item.id}»: «${campo}» no es válido.`);
        }
      }
      if (item.pesoKg != null && !(Number.isFinite(item.pesoKg) && item.pesoKg >= 0)) {
        errores.push(`«${item.id}»: «pesoKg» no es válido.`);
      }
    }
  });
  return errores;
}

// ¿Tiene sentido apuntar un peso en este ejercicio?
function llevaPeso(ejercicio, pesoKg, config) {
  return pesoKg != null || ejercicio.equipo.some((equipo) => config.equiposConPeso.includes(equipo));
}

function crearEntrada(ejercicio, item, tipoDeBloque, catalogo, config) {
  const cantidad = cantidadDe(ejercicio, item);
  const series = item.series ?? 1;
  const pesoKg = item.pesoKg ?? null;
  return {
    ejercicio,
    bloque: tipoDeBloque,
    series,
    modo: cantidad.modo,
    segundos: cantidad.segundos ?? null,
    repeticiones: cantidad.repeticiones ?? null,
    pesoKg,
    conPeso: llevaPeso(ejercicio, pesoKg, config),
    descansoSegundos: descansoDe({ ...item, series }, config),
    rir: item.rir ?? null,
    notas: item.notas ?? '',
    // Solo las alternativas que existen en el catálogo y no son el propio ejercicio.
    alternativas: (item.alternativas ?? []).filter(
      (id) => id !== ejercicio.id && catalogo.buscar(id) !== null,
    ),
    // «En los bloques de fuerza, registro rápido de cada serie» (5.4).
    conRegistro: tipoDeBloque === 'fuerza',
    // Texto de «Mis ajustes» de la máquina. Lo rellena la app con lo guardado en el dispositivo.
    misAjustes: '',
  };
}

// Convierte una sesión en la lista ordenada de «entradas»: un ejercicio con todo lo que
// el reproductor necesita saber para guiarlo.
export function entradasDeSesion(sesion, catalogo, config = CONFIG) {
  const errores = erroresDeSesion(sesion, catalogo);
  if (errores.length > 0) throw new Error(errores.join(' '));
  const entradas = [];
  for (const bloque of sesion.bloques) {
    for (const item of bloque.ejercicios.map(normalizarItem)) {
      entradas.push(crearEntrada(catalogo.buscar(item.id), item, bloque.tipo, catalogo, config));
    }
  }
  return entradas;
}

// «Cambiar ejercicio» (5.4): mantiene las series y el descanso, con la cantidad que la
// alternativa tiene en el catálogo. El peso sugerido era del otro ejercicio: no se arrastra.
export function entradaAlternativa(entrada, idAlternativa, catalogo, config = CONFIG) {
  if (!entrada.alternativas.includes(idAlternativa)) {
    throw new Error(`«${idAlternativa}» no es una alternativa de «${entrada.ejercicio.id}».`);
  }
  const item = {
    id: idAlternativa,
    series: entrada.series,
    descansoSegundos: entrada.series > 1 ? entrada.descansoSegundos : undefined,
    // Desde la alternativa se puede volver al original o pasar a otra de la lista.
    alternativas: [entrada.ejercicio.id, ...entrada.alternativas],
  };
  return crearEntrada(catalogo.buscar(idAlternativa), item, entrada.bloque, catalogo, config);
}

// Pasos de una entrada, en orden. Cada paso es uno de estos:
//   { tipo: 'preparacion', segundos }                          cuenta atrás con el ejercicio en pantalla
//   { tipo: 'trabajo', serie, lado, modo, segundos }           la serie (o un lado de la serie)
//   { tipo: 'cambio-lado', serie, segundos }                   transición entre lados
//   { tipo: 'registro', serie }                                apuntar la serie; espera a que se guarde
//   { tipo: 'descanso', serie, segundos }                      descanso entre series
// `lado` es null, 'izquierdo' o 'derecho'. En modo 'manual' el trabajo no tiene `segundos`:
// termina al pulsar «Hecho».
// `desdeSerie` sirve para «Cambiar ejercicio» a mitad: genera solo las series que faltan.
export function pasosDeEntrada(entrada, ajustes, desdeSerie = 1) {
  const pasos = [{ tipo: 'preparacion', segundos: ajustes.segundosPreparacion }];
  const segundosDeLado =
    entrada.modo === 'tiempo'
      ? entrada.segundos
      : entrada.modo === 'fases'
        ? entrada.repeticiones * segundosPorRepeticion(entrada.ejercicio)
        : null;
  const trabajo = (serie, lado) => ({
    tipo: 'trabajo',
    serie,
    lado,
    modo: entrada.modo,
    segundos: segundosDeLado,
  });

  for (let serie = desdeSerie; serie <= entrada.series; serie += 1) {
    if (entrada.ejercicio.porLado) {
      pasos.push(trabajo(serie, 'izquierdo'));
      pasos.push({ tipo: 'cambio-lado', serie, segundos: ajustes.segundosCambioLado });
      pasos.push(trabajo(serie, 'derecho'));
    } else {
      pasos.push(trabajo(serie, null));
    }
    if (entrada.conRegistro) pasos.push({ tipo: 'registro', serie });
    if (serie < entrada.series) {
      pasos.push({ tipo: 'descanso', serie, segundos: entrada.descansoSegundos });
    }
  }
  return pasos;
}

// Rutinas agrupadas para la pantalla «Rutinas libres»: favoritas arriba
// y el resto por categorías, en el orden de `categorias`.
export function rutinasAgrupadas(catalogo) {
  const favoritas = catalogo.rutinas.filter((rutina) => rutina.favorita);
  const grupos = catalogo.categorias
    .map((categoria) => ({
      categoria,
      rutinas: catalogo.rutinas.filter((r) => !r.favorita && r.categoria === categoria),
    }))
    .filter((grupo) => grupo.rutinas.length > 0);
  // Por si una rutina trae una categoría que no está en la lista: no se pierde.
  const sueltas = catalogo.rutinas.filter(
    (r) => !r.favorita && !catalogo.categorias.includes(r.categoria),
  );
  if (sueltas.length > 0) grupos.push({ categoria: 'Otras', rutinas: sueltas });
  return { favoritas, grupos };
}
