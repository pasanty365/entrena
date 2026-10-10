// Pantalla de inicio.

import { CONFIG } from '../config.js';
import { abrirHoja, h, pantalla } from '../dom.js';
import { minutos, segundosDeSesion } from '../duracion.js';
import { fechaDeHoy, nombreDeLugar, ofertaDelInicio } from '../textos.js';

export async function inicio(app) {
  const [aMedias, fechaDeAlarma, avisoVisto] = await Promise.all([
    app.almacen.sesionAMedias(),
    app.almacen.leerDato('alarmaFecha'),
    app.almacen.leerDato('avisoVisto'),
  ]);
  const oferta = ofertaDelInicio({
    fechaDeAlarma,
    hoy: fechaDeHoy(),
    hayAMedias: Boolean(aMedias),
    hayEjemplo: Boolean(app.ejemplo),
  });
  const contenido = [];

  if (oferta.alarmaHoy) {
    contenido.push(
      h('p', { class: 'aviso aviso-peligro' }, CONFIG.avisoDeAlarma),
      h('p', { class: 'suave' }, 'Hoy la app no te ofrece sesiones. Mañana vuelven a estar aquí.'),
    );
  } else {
    if (oferta.seguir) {
      await app.prepararImagenes(aMedias.entradas.flatMap((entrada) => [entrada.ejercicio.id, ...entrada.alternativas]));
      contenido.push(
        h(
          'section',
          { class: 'tarjeta' },
          h('h2', {}, 'Tienes una sesión a medias'),
          h('p', { class: 'suave' }, `${aMedias.sesion.titulo} · ejercicio ${aMedias.iEntrada + 1} de ${aMedias.entradas.length}`),
          h(
            'button',
            {
              class: 'boton boton-principal',
              onclick: () => {
                // La voz y el sonido se desbloquean dentro del toque (sección 9).
                app.voz.desbloquear();
                app.sonido.desbloquear();
                app.ir('reproductor', { instantanea: aMedias });
              },
            },
            'Seguir donde lo dejaste',
          ),
          h(
            'button',
            {
              class: 'boton boton-plano',
              onclick: async () => {
                await app.almacen.borrarSesionAMedias();
                app.ir('inicio');
              },
            },
            'Descartarla',
          ),
        ),
      );
    }
    const ejemplo = app.ejemplo;
    if (oferta.ejemplo) {
      const duracion = minutos(segundosDeSesion(ejemplo, app.catalogo.buscar, app.catalogo.ajustes));
      contenido.push(
        h(
          'section',
          { class: 'tarjeta' },
          h('h2', {}, ejemplo.titulo),
          h('p', { class: 'suave' }, [`${duracion} min`, nombreDeLugar(ejemplo.lugar)].filter(Boolean).join(' · ')),
          h(
            'button',
            {
              class: aMedias ? 'boton' : 'boton boton-principal',
              onclick: () => app.ir('sesion', { sesion: ejemplo, volver: 'inicio' }),
            },
            'Ver la sesión',
          ),
        ),
      );
    }
  }

  if (oferta.rutinas) {
    contenido.push(h('button', { class: 'boton', onclick: () => app.ir('rutinas') }, 'Rutinas libres'));
  }

  const nodo = pantalla({
    cabecera: [
      h('h1', {}, 'Entrena'),
      h('button', { class: 'boton boton-plano', onclick: () => app.ir('ajustes') }, 'Ajustes'),
    ],
    contenido,
  });

  // Aviso de la primera vez (7.5).
  let cerrar = null;
  if (!avisoVisto) {
    cerrar = abrirHoja(
      h('h2', {}, 'Antes de empezar'),
      h('p', {}, CONFIG.avisoInicial),
      h(
        'button',
        {
          class: 'boton boton-principal',
          onclick: async () => {
            await app.almacen.guardarDato('avisoVisto', true);
            cerrar();
            cerrar = null;
          },
        },
        'Entendido',
      ),
    );
  }
  return { nodo, alSalir: () => cerrar?.() };
}
