// Ajustes: interruptores de voz y sonido, e importación de sesiones e imágenes en versión mínima.
// La pantalla completa de 5.7 (asignar imágenes a mano, cambiar colores, editar ejercicios) llega después.

import { importarImagenes, importarSesiones } from '../almacen.js';
import { CONFIG } from '../config.js';
import { h, pantalla, poner } from '../dom.js';
import { etiquetaDeVoz, idDeVoz } from '../voz.js';

export async function ajustes(app) {
  const mensaje = h('p', { class: 'aviso', role: 'status', hidden: true });
  const decir = (texto, esError = false) => {
    mensaje.hidden = false;
    mensaje.className = esError ? 'aviso aviso-peligro' : 'aviso';
    mensaje.textContent = texto;
  };

  // ---- Voz y sonido ----
  const interruptor = (etiqueta, clave, aplicar) =>
    h(
      'label',
      { class: 'interruptor' },
      h('span', {}, etiqueta),
      h('input', {
        type: 'checkbox',
        role: 'switch',
        checked: app.ajustes[clave],
        onchange: async (evento) => {
          app.ajustes = { ...app.ajustes, [clave]: evento.target.checked };
          aplicar(evento.target.checked);
          await app.almacen.guardarAjustes(app.ajustes);
        },
      }),
    );

  const probar = () => {
    app.voz.desbloquear();
    app.sonido.desbloquear();
    app.sonido.pitido();
    const haDicho = app.voz.decir('Así suena la voz de Entrena.');
    if (!app.voz.disponible) decir('Este navegador no tiene voz.', true);
    else if (!haDicho && !app.sonido.estaActivo()) decir('La voz y el sonido están apagados.');
  };

  // ---- Selector de voz ----
  const FRASE_DE_PRUEBA = 'Prepárate: Puente. 3 series de 10 repeticiones.';
  const listaDeVoces = h('div', { class: 'lista', role: 'radiogroup', 'aria-label': 'Voz de la app' });

  async function elegirVoz(id) {
    app.ajustes = { ...app.ajustes, vozElegida: id };
    app.voz.elegir(id);
    await app.almacen.guardarAjustes(app.ajustes);
  }

  function oir(id) {
    app.voz.desbloquear();
    app.voz.decir(FRASE_DE_PRUEBA, { interrumpir: true, con: id, aunqueEsteApagada: true });
  }

  function pintarVoces() {
    const voces = app.voz.voces();
    const elegida = app.voz.vozElegida();
    const fila = (id, etiqueta, marcada) =>
      h(
        'div',
        { class: 'fila fila-fija fila-de-voz' },
        h(
          'label',
          { class: 'opcion' },
          h('input', { type: 'radio', name: 'voz', checked: marcada, onchange: () => elegirVoz(id) }),
          h('span', {}, etiqueta),
        ),
        h('button', { class: 'boton boton-oir', 'aria-label': `Oír ${etiqueta}`, onclick: () => oir(id) }, 'Oír'),
      );
    if (voces.length === 0) {
      poner(listaDeVoces, h('p', { class: 'suave' }, 'Este dispositivo no ofrece ninguna voz en español, o todavía no ha entregado la lista.'));
      return;
    }
    const sigueDisponible = voces.some((voz) => idDeVoz(voz) === elegida);
    poner(
      listaDeVoces,
      fila(null, 'Automática (español de España)', !sigueDisponible),
      voces.map((voz) => fila(idDeVoz(voz), etiquetaDeVoz(voz), idDeVoz(voz) === elegida)),
    );
  }
  // El iPhone entrega la lista de voces con retraso: se repinta cuando llega.
  const dejarDeEscucharVoces = app.voz.alCambiarVoces(pintarVoces);
  pintarVoces();

  // ---- Sesiones ----
  const listaDeSesiones = h('ul', { class: 'lista' });
  async function pintarSesiones() {
    const sesiones = await app.almacen.sesiones();
    poner(
      listaDeSesiones,
      sesiones.length === 0
        ? h('li', { class: 'suave' }, 'No hay sesiones importadas.')
        : sesiones.map((sesion) =>
            h(
              'li',
              { class: 'fila fila-fija' },
              h('span', { class: 'fila-texto' }, sesion.titulo),
              h(
                'button',
                {
                  class: 'boton boton-plano',
                  onclick: async () => {
                    await app.almacen.borrarSesion(sesion.id);
                    await pintarSesiones();
                  },
                },
                'Quitar',
              ),
            ),
          ),
    );
  }

  async function alElegirSesiones(evento) {
    const [archivo] = evento.target.files;
    evento.target.value = '';
    if (!archivo) return;
    try {
      const datos = JSON.parse(await archivo.text());
      const { guardadas, rechazadas } = await importarSesiones(datos, app.catalogo, app.almacen);
      const partes = [`Sesiones guardadas: ${guardadas.length}.`];
      for (const rechazada of rechazadas) partes.push(`«${rechazada.titulo}» no se ha guardado: ${rechazada.errores.join(' ')}`);
      decir(partes.join(' '), rechazadas.length > 0);
      await pintarSesiones();
    } catch (error) {
      decir(`No se ha podido leer el archivo. ${error.message}`, true);
    }
  }

  // ---- Imágenes ----
  const cuentaDeImagenes = h('p', { class: 'suave' });
  async function pintarImagenes() {
    const ids = await app.almacen.idsDeImagenes();
    cuentaDeImagenes.textContent = `${ids.length} de ${app.catalogo.ejercicios.length} ejercicios tienen imagen.`;
  }

  async function alElegirImagenes(evento) {
    const archivos = Array.from(evento.target.files);
    evento.target.value = '';
    if (archivos.length === 0) return;
    decir(`Importando ${archivos.length} imágenes…`);
    const { guardadas, sinCasar, fallidas } = await importarImagenes(archivos, app.catalogo, app.almacen);
    app.olvidarImagenes();
    const partes = [`Imágenes guardadas: ${guardadas.length}.`];
    if (sinCasar.length > 0) partes.push(`Sin ejercicio con ese nombre: ${sinCasar.join(', ')}.`);
    if (fallidas.length > 0) partes.push(`No se han podido leer: ${fallidas.join(', ')}.`);
    decir(partes.join(' '), sinCasar.length + fallidas.length > 0);
    await pintarImagenes();
  }

  // ---- Estado de la app: sirve para las pruebas en el iPhone ----
  async function estadoDeLaApp() {
    const instalada =
      globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone === true;
    let persistente = null;
    try {
      persistente = (await navigator.storage?.persisted?.()) ?? null;
    } catch {
      persistente = null;
    }
    const copia = Boolean(navigator.serviceWorker?.controller);
    return [
      instalada ? 'Abierta como app instalada.' : 'Abierta en el navegador, no como app instalada.',
      copia ? 'Copia para el modo avión: lista.' : 'Copia para el modo avión: todavía no (o no disponible aquí).',
      persistente === null
        ? 'Este navegador no dice si conservará los datos.'
        : persistente
          ? 'El dispositivo ha aceptado conservar los datos.'
          : 'El dispositivo no garantiza conservar los datos.',
    ];
  }
  const lineasDeEstado = await estadoDeLaApp();

  // Un botón que abre el selector de archivos del sistema.
  const botonDeArchivo = (texto, opciones, alElegir) =>
    h('label', { class: 'boton' }, texto, h('input', { class: 'oculto', type: 'file', onchange: alElegir, ...opciones }));

  await Promise.all([pintarSesiones(), pintarImagenes()]);

  const nodo = pantalla({
    cabecera: [
      h('button', { class: 'boton boton-plano', onclick: () => app.ir('inicio') }, '‹ Inicio'),
      h('h1', {}, 'Ajustes'),
    ],
    contenido: [
      mensaje,
      h(
        'section',
        { class: 'tarjeta' },
        h('h2', {}, 'Voz y sonido'),
        interruptor('Voz', 'voz', (valor) => app.voz.activar(valor)),
        interruptor('Pitidos', 'sonido', (valor) => app.sonido.activar(valor)),
        h('button', { class: 'boton', onclick: probar }, 'Probar voz y pitido'),
      ),
      h(
        'section',
        { class: 'tarjeta' },
        h('h2', {}, 'Voz de la app'),
        h('p', { class: 'suave pequeno' }, 'Son las voces en español que ofrece este dispositivo. Pulsa «Oír» para probarlas y marca la que prefieras.'),
        listaDeVoces,
      ),
      h(
        'section',
        { class: 'tarjeta' },
        h('h2', {}, 'Sesiones de gimnasio'),
        listaDeSesiones,
        botonDeArchivo('Importar sesiones', { accept: '.json,application/json' }, alElegirSesiones),
        h('p', { class: 'suave pequeno' }, 'Elige un archivo como sesiones-gimnasio.json. Se guarda solo en este dispositivo.'),
      ),
      h(
        'section',
        { class: 'tarjeta' },
        h('h2', {}, 'Imágenes'),
        cuentaDeImagenes,
        botonDeArchivo('Importar imágenes', { accept: 'image/*', multiple: true }, alElegirImagenes),
        h('p', { class: 'suave pequeno' }, 'Puedes elegir muchas a la vez. Cada una va al ejercicio que se llama igual: puente.png es la del ejercicio «puente».'),
        h(
          'button',
          {
            class: 'boton boton-plano',
            onclick: async () => {
              await app.almacen.borrarImagenes();
              app.olvidarImagenes();
              await pintarImagenes();
              decir('Imágenes quitadas de este dispositivo.');
            },
          },
          'Quitar todas las imágenes',
        ),
      ),
      h(
        'section',
        { class: 'tarjeta' },
        h('h2', {}, 'Pruebas'),
        h('button', { class: 'boton', onclick: () => app.ir('microfono') }, 'Prueba del micrófono'),
        h('p', { class: 'suave pequeno' }, 'Provisional: graba y reproduce, sin enviar nada. Sirve para saber si se podrá hablar con el entrenador.'),
        lineasDeEstado.map((linea) => h('p', { class: 'suave pequeno' }, linea)),
      ),
      h('p', { class: 'aviso' }, CONFIG.avisoInicial),
    ],
  });
  return { nodo, alSalir: dejarDeEscucharVoces };
}
