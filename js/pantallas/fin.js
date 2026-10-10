// Pantallas de final de sesión: el resumen y el aviso de alarma (7.3).

import { CONFIG } from '../config.js';
import { h, pantalla } from '../dom.js';
import { seriesPorEjercicio, sesionTrasAlarmaAnulada, textoDuracion } from '../textos.js';

function cuerpoDelResumen(app, resumen) {
  const grupos = seriesPorEjercicio(resumen.registros, app.catalogo.buscar);
  return [
    h(
      'section',
      { class: 'tarjeta' },
      h('h2', {}, resumen.titulo),
      h('p', {}, `Ha durado ${textoDuracion(resumen.duracionSegundos)}.`),
      h('p', {}, `Ejercicios completados: ${resumen.ejerciciosCompletados} de ${resumen.ejerciciosTotales}.`),
    ),
    grupos.length > 0 &&
      h(
        'section',
        { class: 'tarjeta' },
        h('h2', {}, 'Series registradas'),
        h(
          'ul',
          { class: 'lista' },
          grupos.map((grupo) =>
            h(
              'li',
              { class: 'fila fila-fija' },
              h('span', { class: 'fila-texto' }, h('strong', {}, grupo.nombre), grupo.series.map((serie) => h('span', { class: 'suave pequeno' }, serie))),
            ),
          ),
        ),
      ),
  ];
}

export function fin(app, { resumen }) {
  return pantalla({
    cabecera: [h('h1', {}, resumen.terminada ? 'Sesión terminada' : 'Sesión sin terminar')],
    contenido: cuerpoDelResumen(app, resumen),
    pie: [h('button', { class: 'boton boton-principal', onclick: () => app.ir('inicio') }, 'Volver al inicio')],
  });
}

// «No me encuentro bien»: la app para la sesión al primer toque y muestra el aviso (7.3).
// «Lo he pulsado sin querer» deshace la parada y vuelve a la sesión donde estaba, en pausa.
// Si no se pulsa, ese día el inicio no ofrece sesiones.
export function alarma(app, { resumen, guardada = null, instantanea = null }) {
  const sinQuerer = () => {
    app.voz.callar();
    // Dentro del toque, para que la voz pueda volver a sonar (sección 9).
    app.voz.desbloquear();
    app.sonido.desbloquear();
    app.almacen.borrarDato('alarmaFecha').catch(() => {});
    // La sesión parada se quita del historial: sigue viva y se apuntará entera al acabar.
    Promise.resolve(guardada)
      .then((numero) => (numero == null ? null : app.almacen.borrarSesionHecha(numero)))
      .catch(() => {});
    app.ir('reproductor', { instantanea: sesionTrasAlarmaAnulada(instantanea) });
  };
  return pantalla({
    clase: 'alarma',
    cabecera: [h('h1', {}, 'Sesión parada')],
    contenido: [h('p', { class: 'mensaje', role: 'alert' }, CONFIG.avisoDeAlarma), cuerpoDelResumen(app, resumen)],
    pie: [
      h('button', { class: 'boton', onclick: () => app.ir('inicio') }, 'Volver al inicio'),
      instantanea && h('button', { class: 'boton boton-plano boton-ancho', onclick: sinQuerer }, 'Lo he pulsado sin querer'),
    ],
  });
}
