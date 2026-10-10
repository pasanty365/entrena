// «Rutinas libres»: favoritas arriba, el resto por categorías con los grupos plegados,
// y las sesiones de gimnasio importadas en el grupo «Gimnasio» (5.4).

import { rutinaComoSesion, rutinasAgrupadas } from '../catalogo.js';
import { h, pantalla } from '../dom.js';
import { minutos, segundosDeRutina, segundosDeSesion } from '../duracion.js';

export async function rutinas(app) {
  const { buscar, ajustes } = app.catalogo;
  const { favoritas, grupos } = rutinasAgrupadas(app.catalogo);
  const importadas = await app.almacen.sesiones();

  const fila = (titulo, detalle, duracion, alPulsar) =>
    h(
      'li',
      {},
      h(
        'button',
        { class: 'fila', onclick: alPulsar },
        h('span', { class: 'fila-texto' }, h('strong', {}, titulo), h('span', { class: 'suave pequeno' }, detalle)),
        h('span', { class: 'fila-dato' }, `${duracion} min`),
      ),
    );

  const filaDeRutina = (rutina) =>
    fila(
      rutina.nombre,
      `${rutina.ejercicios.length} ejercicios`,
      minutos(segundosDeRutina(rutina, buscar, ajustes)),
      () => app.ir('sesion', { sesion: rutinaComoSesion(rutina), volver: 'rutinas' }),
    );

  const filaDeSesion = (sesion) =>
    fila(
      sesion.titulo,
      `${sesion.bloques.reduce((n, bloque) => n + bloque.ejercicios.length, 0)} ejercicios`,
      minutos(segundosDeSesion(sesion, buscar, ajustes)),
      () => app.ir('sesion', { sesion, volver: 'rutinas' }),
    );

  const grupo = (titulo, cuantas, cuerpo) =>
    h('details', { class: 'grupo' }, h('summary', {}, `${titulo} (${cuantas})`), cuerpo);

  return pantalla({
    cabecera: [
      h('button', { class: 'boton boton-plano', onclick: () => app.ir('inicio') }, '‹ Inicio'),
      h('h1', {}, 'Rutinas libres'),
    ],
    contenido: [
      h('section', { class: 'tarjeta' }, h('h2', {}, 'Favoritas'), h('ul', { class: 'lista' }, favoritas.map(filaDeRutina))),
      grupo(
        'Gimnasio',
        importadas.length,
        importadas.length > 0
          ? h('ul', { class: 'lista' }, importadas.map(filaDeSesion))
          : h('p', { class: 'suave' }, 'Aún no hay sesiones de gimnasio. Impórtalas desde Ajustes.'),
      ),
      grupos.map((g) => grupo(g.categoria, g.rutinas.length, h('ul', { class: 'lista' }, g.rutinas.map(filaDeRutina)))),
    ],
  });
}
