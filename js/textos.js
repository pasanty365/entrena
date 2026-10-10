// Textos que se muestran en pantalla, calculados a partir de los datos. Funciones puras.

import { textoNumero } from './numeros.js';

const BLOQUES = {
  calentamiento: 'Calentamiento',
  fuerza: 'Fuerza',
  cardio: 'Cardio',
  movilidad: 'Movilidad',
  'vuelta-a-la-calma': 'Vuelta a la calma',
  rutina: '',
};

const LUGARES = { gimnasio: 'Gimnasio', casa: 'Casa', exterior: 'Exterior' };

export const nombreDeBloque = (tipo) => BLOQUES[tipo] ?? tipo ?? '';
export const nombreDeLugar = (lugar) => LUGARES[lugar] ?? '';

const plural = (n, uno, varios) => `${textoNumero(n)} ${n === 1 ? uno : varios}`;

// Para las listas: «3 × 10», «2 × 20 s», «30 s», «10 rep».
export function cantidadCorta(entrada) {
  const unidad = entrada.modo === 'tiempo' ? `${entrada.segundos} s` : `${entrada.repeticiones}`;
  if (entrada.series > 1) return `${entrada.series} × ${unidad}`;
  return entrada.modo === 'tiempo' ? unidad : `${unidad} rep`;
}

// Para la tarjeta: «3 series · 10 repeticiones por lado · 20 kg · descanso 60 s».
export function queToca(entrada) {
  const partes = [];
  if (entrada.series > 1) partes.push(`${entrada.series} series`);
  const cantidad =
    entrada.modo === 'tiempo'
      ? plural(entrada.segundos, 'segundo', 'segundos')
      : plural(entrada.repeticiones, 'repetición', 'repeticiones');
  partes.push(entrada.ejercicio.porLado ? `${cantidad} por lado` : cantidad);
  if (entrada.pesoKg) partes.push(`${textoNumero(entrada.pesoKg)} kg`);
  if (entrada.series > 1) partes.push(`descanso ${entrada.descansoSegundos} s`);
  return partes.join(' · ');
}

// La línea que dice en qué punto está la sesión.
export function textoDeEstado(vista) {
  const { paso, series } = vista;
  let texto;
  if (paso.tipo === 'preparacion') texto = 'Prepárate';
  else if (paso.tipo === 'cambio-lado') texto = 'Cambia de lado';
  else if (paso.tipo === 'descanso') texto = `Descanso · después, serie ${paso.serie + 1} de ${series}`;
  else if (paso.tipo === 'registro') texto = series > 1 ? `Serie ${paso.serie} de ${series} hecha` : 'Serie hecha';
  else {
    const partes = [];
    if (series > 1) partes.push(`Serie ${paso.serie} de ${series}`);
    if (paso.lado) partes.push(`Lado ${paso.lado}`);
    texto = partes.length > 0 ? partes.join(' · ') : 'En marcha';
  }
  return vista.pausado ? `En pausa · ${texto}` : texto;
}

// Fecha de hoy en el dispositivo, como «2026-10-10».
export function fechaDeHoy(ahora = new Date()) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
}

// «28 min»; por debajo de un minuto, «40 s».
export function textoDuracion(segundos) {
  return segundos < 60 ? `${Math.round(segundos)} s` : `${Math.round(segundos / 60)} min`;
}

// Para el resumen final: las series registradas, agrupadas por ejercicio y en orden.
// → [{ nombre: 'Sentadilla', series: ['10 rep · Poco', '9 rep · Nada'] }]
export function seriesPorEjercicio(registros, buscar) {
  const grupos = [];
  for (const registro of registros) {
    let grupo = grupos.at(-1);
    if (!grupo || grupo.clave !== `${registro.iEntrada}:${registro.ejercicioId}`) {
      grupo = {
        clave: `${registro.iEntrada}:${registro.ejercicioId}`,
        nombre: buscar(registro.ejercicioId)?.nombre ?? registro.ejercicioId,
        series: [],
      };
      grupos.push(grupo);
    }
    const partes = [];
    if (registro.repeticiones != null) partes.push(`${registro.repeticiones} rep`);
    if (registro.segundos != null) partes.push(`${registro.segundos} s`);
    if (registro.pesoKg != null) partes.push(`${textoNumero(registro.pesoKg)} kg`);
    if (registro.margen) partes.push(registro.margen);
    grupo.series.push(partes.join(' · '));
  }
  return grupos.map(({ nombre, series }) => ({ nombre, series }));
}

// Qué ofrece la pantalla de inicio. El día que se pulsa «No me encuentro bien» (y no se deshace
// con «Lo he pulsado sin querer»), no se ofrece ninguna sesión: ni la de ejemplo, ni seguir
// una a medias, ni las rutinas libres (7.3).
export function ofertaDelInicio({ fechaDeAlarma, hoy, hayAMedias, hayEjemplo }) {
  const alarmaHoy = Boolean(fechaDeAlarma) && fechaDeAlarma === hoy;
  return {
    alarmaHoy,
    seguir: !alarmaHoy && hayAMedias,
    ejemplo: !alarmaHoy && hayEjemplo,
    rutinas: !alarmaHoy,
  };
}

// «Lo he pulsado sin querer»: la sesión guardada justo antes de la alarma, con el toque apuntado.
export function sesionTrasAlarmaAnulada(instantanea) {
  return {
    ...instantanea,
    incidencias: [
      ...instantanea.incidencias,
      {
        tipo: 'alarma-anulada',
        ejercicioId: instantanea.entradas[instantanea.iEntrada]?.ejercicio.id ?? null,
        momentoMs: instantanea.transcurridoMs,
      },
    ],
  };
}

// Cabecera del reproductor, en una línea: «1/16 · Calentamiento».
export function textoDeProgreso(vista) {
  const bloque = nombreDeBloque(vista.entrada?.bloque);
  return [`${vista.numero}/${vista.total}`, bloque].filter(Boolean).join(' · ');
}
