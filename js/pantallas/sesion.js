// Vista previa de una sesión o rutina, con el botón «Empezar».

import { entradasDeSesion } from '../catalogo.js';
import { h, pantalla } from '../dom.js';
import { minutos, segundosDeSesion } from '../duracion.js';
import { cantidadCorta, nombreDeBloque, nombreDeLugar } from '../textos.js';

export async function sesion(app, { sesion: datos, volver = 'inicio' }) {
  const { buscar, ajustes } = app.catalogo;
  const botonVolver = h('button', { class: 'boton boton-plano', onclick: () => app.ir(volver) }, '‹ Volver');

  let entradas;
  try {
    entradas = entradasDeSesion(datos, app.catalogo);
  } catch (error) {
    return pantalla({
      cabecera: [botonVolver, h('h1', {}, datos?.titulo ?? 'Sesión')],
      contenido: [h('p', { class: 'aviso aviso-peligro' }, 'Esta sesión no se puede reproducir.'), h('p', { class: 'suave' }, error.message)],
    });
  }

  // «Mis ajustes» de cada máquina se leen ya, para que al pulsar «Empezar» todo esté listo
  // y la voz arranque dentro del mismo toque (sección 9).
  await Promise.all(
    entradas
      .filter((entrada) => entrada.ejercicio.maquina)
      .map(async (entrada) => {
        entrada.misAjustes = await app.almacen.misAjustes(entrada.ejercicio.id);
      }),
  );

  // Y las imágenes, incluidas las de las alternativas, para que la tarjeta no dé saltos al pintarse.
  await app.prepararImagenes(entradas.flatMap((entrada) => [entrada.ejercicio.id, ...entrada.alternativas]));

  const duracion = minutos(segundosDeSesion(datos, buscar, ajustes));
  const resumen = [`${duracion} min`, nombreDeLugar(datos.lugar), `${entradas.length} ejercicios`].filter(Boolean).join(' · ');

  const contenido = [h('p', { class: 'que-toca' }, resumen)];
  if (datos.motivo) contenido.push(h('p', {}, datos.motivo));
  for (const aviso of datos.avisos ?? []) contenido.push(h('p', { class: 'aviso' }, aviso));

  let indice = 0;
  for (const bloque of datos.bloques) {
    const filas = bloque.ejercicios.map(() => {
      const entrada = entradas[indice];
      indice += 1;
      return h(
        'li',
        { class: 'fila fila-fija' },
        h('span', { class: 'fila-texto' }, entrada.ejercicio.nombre),
        h('span', { class: 'fila-dato' }, cantidadCorta(entrada)),
      );
    });
    contenido.push(
      h(
        'section',
        { class: 'tarjeta' },
        nombreDeBloque(bloque.tipo) && h('h2', { class: 'titulo-bloque' }, nombreDeBloque(bloque.tipo)),
        h('ul', { class: 'lista' }, filas),
      ),
    );
  }

  return pantalla({
    cabecera: [botonVolver, h('h1', {}, datos.titulo)],
    contenido,
    pie: [
      h(
        'button',
        {
          class: 'boton boton-principal',
          onclick: () => {
            // Dentro del mismo toque: desbloquear voz y sonido y arrancar (sección 9).
            app.voz.desbloquear();
            app.sonido.desbloquear();
            app.ir('reproductor', {
              sesion: { id: datos.id, titulo: datos.titulo, esRutina: Boolean(datos.esRutina) },
              entradas,
            });
          },
        },
        'Empezar',
      ),
    ],
  });
}
