// Cálculo de la duración (sección 4.4 de INSTRUCCIONES.md).
// No toca la pantalla ni el almacenamiento: son funciones puras, fáciles de probar.
//
// `ejercicio` es un ejercicio del catálogo (4.1).
// `item` es un elemento de una sesión (4.3) o de una rutina (4.2): un `id` suelto
//   o un objeto con `id` y, si acaso, `series`, `repeticiones`, `segundos` y `descansoSegundos`.
// `buscar` es una función que devuelve el ejercicio del catálogo a partir de su `id`.
// `ajustes` trae `segundosPreparacion` y `segundosCambioLado` (vienen en `ejercicios.json`).

import { CONFIG } from './config.js';

// Un elemento de rutina puede ser solo el `id`: lo convierte en objeto.
export function normalizarItem(item) {
  return typeof item === 'string' ? { id: item } : item;
}

// Suma de los segundos de las fases de un ejercicio dinámico: lo que dura una repetición.
export function segundosPorRepeticion(ejercicio) {
  return (ejercicio.fases ?? []).reduce((total, fase) => total + fase.segundos, 0);
}

// Cantidad que toca: la del elemento de la sesión o rutina y, si no la trae, la del catálogo.
// `modo` dice cómo se guía la serie:
//   'tiempo': cuenta atrás de `segundos` (mantenido y continuo);
//   'fases':  `repeticiones` guiadas por fases (dinamico);
//   'manual': `repeticiones` a mi ritmo, hasta pulsar «Hecho» (series).
export function cantidadDe(ejercicio, item = {}) {
  if (ejercicio.tipo === 'mantenido' || ejercicio.tipo === 'continuo') {
    return { modo: 'tiempo', segundos: item.segundos ?? ejercicio.segundos };
  }
  const repeticiones = item.repeticiones ?? ejercicio.repeticiones;
  if (ejercicio.tipo === 'dinamico') return { modo: 'fases', repeticiones };
  if (ejercicio.tipo === 'series') return { modo: 'manual', repeticiones };
  throw new Error(`Tipo de ejercicio desconocido: «${ejercicio.tipo}» en «${ejercicio.id}».`);
}

// Lo que dura un lado de una serie, en segundos.
export function segundosDeLado(ejercicio, item = {}, config = CONFIG) {
  const cantidad = cantidadDe(ejercicio, item);
  if (cantidad.modo === 'tiempo') return cantidad.segundos;
  if (cantidad.modo === 'fases') return cantidad.repeticiones * segundosPorRepeticion(ejercicio);
  return cantidad.repeticiones * config.segundosPorRepeticionEnSeries;
}

// Lo que dura una serie. Con `porLado`, el doble más el cambio de lado.
export function segundosDeSerie(ejercicio, item, ajustes, config = CONFIG) {
  const lado = segundosDeLado(ejercicio, item, config);
  return ejercicio.porLado ? 2 * lado + ajustes.segundosCambioLado : lado;
}

// Descanso entre series: el que diga la sesión; si falta y hay más de una serie, el de por defecto.
export function descansoDe(item, config = CONFIG) {
  const series = item.series ?? 1;
  if (series <= 1) return 0;
  return item.descansoSegundos ?? config.descansoPorDefectoSegundos;
}

// Preparación + series + descansos entre series.
export function segundosDeEjercicio(ejercicio, item, ajustes, config = CONFIG) {
  const series = item.series ?? 1;
  return (
    ajustes.segundosPreparacion +
    series * segundosDeSerie(ejercicio, item, ajustes, config) +
    (series - 1) * descansoDe(item, config)
  );
}

// Tiempo en movimiento de un ejercicio: sin preparación ni descansos.
// Sirve para la regla del calentamiento (7.1), que se aplica en la fase 3.
// El cambio de lado se cuenta como movimiento (duda 14 de PROGRESO.md: hoy no cambia el resultado).
export function segundosEnMovimientoDeEjercicio(ejercicio, item, ajustes, config = CONFIG) {
  return (item.series ?? 1) * segundosDeSerie(ejercicio, item, ajustes, config);
}

function ejercicioDe(item, buscar) {
  const ejercicio = buscar(item.id);
  if (!ejercicio) throw new Error(`El ejercicio «${item.id}» no está en el catálogo.`);
  return ejercicio;
}

export function segundosDeBloque(bloque, buscar, ajustes, config = CONFIG) {
  return bloque.ejercicios
    .map(normalizarItem)
    .reduce(
      (total, item) => total + segundosDeEjercicio(ejercicioDe(item, buscar), item, ajustes, config),
      0,
    );
}

export function segundosEnMovimientoDeBloque(bloque, buscar, ajustes, config = CONFIG) {
  return bloque.ejercicios
    .map(normalizarItem)
    .reduce(
      (total, item) =>
        total + segundosEnMovimientoDeEjercicio(ejercicioDe(item, buscar), item, ajustes, config),
      0,
    );
}

// La sesión dura la suma de sus ejercicios.
export function segundosDeSesion(sesion, buscar, ajustes, config = CONFIG) {
  return sesion.bloques.reduce(
    (total, bloque) => total + segundosDeBloque(bloque, buscar, ajustes, config),
    0,
  );
}

// Las rutinas libres usan el mismo cálculo, con una serie y sin descansos.
export function segundosDeRutina(rutina, buscar, ajustes, config = CONFIG) {
  const ejercicios = rutina.ejercicios.map((item) => ({ ...normalizarItem(item), series: 1 }));
  return segundosDeBloque({ ejercicios }, buscar, ajustes, config);
}

// Minutos que se muestran: redondeados, con 1 como mínimo.
export function minutos(segundos) {
  return Math.max(1, Math.round(segundos / 60));
}
