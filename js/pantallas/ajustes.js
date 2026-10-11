// Ajustes: interruptores de voz y sonido, e importación de sesiones e imágenes en versión mínima.
// La pantalla completa de 5.7 (asignar imágenes a mano, cambiar colores, editar ejercicios) llega después.

import { importarImagenes, importarSesiones } from '../almacen.js';
import { CONFIG } from '../config.js';
import { h, pantalla, poner } from '../dom.js';
import { crearGrabadora } from '../microfono.js';
import { crearPruebaDeSonido } from '../prueba-de-sonido.js';
import { diagnosticoDeVoces, etiquetaDeVoz, idDeVoz, sinVocesRepetidas } from '../voz.js';

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
    // `desbloquear` ya hace sonar un pitido dentro del toque.
    app.sonido.desbloquear();
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
    // `desbloquear` pide también el modo de sonido que no hace caso del interruptor de silencio.
    app.voz.desbloquear();
    app.voz.decir(FRASE_DE_PRUEBA, { interrumpir: true, con: id, aunqueEsteApagada: true });
  }

  function pintarVoces() {
    const elegida = app.voz.vozElegida();
    // El iPhone da la misma voz en dos calidades con el mismo nombre: se enseña una sola.
    const voces = sinVocesRepetidas(app.voz.voces(), elegida);
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
      // «Automática» no impone ninguna voz: habla la que el dispositivo tenga puesta para español
      // (en el iPhone, Ajustes → Accesibilidad → Contenido leído → Voces), de la primera frase a la última.
      fila(null, 'Automática: la voz que tengas puesta en el iPhone', !sigueDisponible),
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
    // La versión es el nombre de la copia que guarda el service worker («entrena-<versión>»).
    let version = null;
    try {
      const nombres = (await globalThis.caches?.keys()) ?? [];
      version = nombres.find((nombre) => nombre.startsWith('entrena-'))?.slice('entrena-'.length) ?? null;
    } catch {
      version = null;
    }
    app.version = version ?? 'sin copia instalada';
    return [
      instalada ? 'Abierta como app instalada.' : 'Abierta en el navegador, no como app instalada.',
      copia ? 'Copia para el modo avión: lista.' : 'Copia para el modo avión: todavía no (o no disponible aquí).',
      persistente === null
        ? 'Este navegador no dice si conservará los datos.'
        : persistente
          ? 'El dispositivo ha aceptado conservar los datos.'
          : 'El dispositivo no garantiza conservar los datos.',
      `Versión de la app: ${app.version}.`,
    ];
  }
  const lineasDeEstado = await estadoDeLaApp();

  // ---- Diagnóstico de voces: un texto para copiar y pegar ----
  const cajaDeDiagnostico = h('textarea', {
    class: 'campo diagnostico',
    readOnly: true,
    rows: 12,
    hidden: true,
    'aria-label': 'Diagnóstico de voces',
  });
  const botonCopiar = h('button', { class: 'boton', hidden: true }, 'Copiar el diagnóstico');

  function textoDelDiagnostico() {
    let modoDeSonido = 'no disponible en este navegador';
    try {
      if (navigator.audioSession) modoDeSonido = navigator.audioSession.type;
    } catch {
      modoDeSonido = 'no se puede leer';
    }
    return diagnosticoDeVoces({
      voces: app.voz.todasLasVoces(),
      elegida: app.voz.vozElegida(),
      enUso: app.voz.vozEnUso(),
      ultima: app.voz.ultimaLocucion(),
      entorno: {
        Fecha: new Date().toISOString(),
        'Versión de la app': app.version ?? 'desconocida',
        'App instalada': lineasDeEstado[0],
        'Modo de sonido': modoDeSonido,
        'Interruptor de voz de la app': app.voz.estaActiva() ? 'encendido' : 'apagado',
        Navegador: navigator.userAgent,
      },
    });
  }

  // Dice una frase con la voz que usa la app, espera a ver qué contesta el dispositivo y lo enseña.
  async function hacerDiagnostico() {
    app.voz.desbloquear();
    app.voz.decir('Esta es la voz que usa Entrena.', { interrumpir: true, aunqueEsteApagada: true });
    cajaDeDiagnostico.hidden = false;
    botonCopiar.hidden = false;
    cajaDeDiagnostico.value = 'Probando la voz…';
    // Hasta 6 segundos para que la frase empiece y termine (o falle).
    for (let i = 0; i < 24; i += 1) {
      await new Promise((resolver) => setTimeout(resolver, 250));
      const eventos = app.voz.ultimaLocucion()?.eventos ?? [];
      if (eventos.some((evento) => evento === 'terminó' || evento.startsWith('error'))) break;
    }
    cajaDeDiagnostico.value = textoDelDiagnostico();
  }

  botonCopiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(cajaDeDiagnostico.value);
      decir('Diagnóstico copiado. Pégalo en el mensaje.');
    } catch {
      // Si el dispositivo no deja copiar desde un botón, se deja el texto seleccionado.
      cajaDeDiagnostico.focus();
      cajaDeDiagnostico.select();
      decir('No se ha podido copiar solo. El texto está seleccionado: pulsa «Copiar» en el menú.');
    }
  });

  // ---- Prueba de sonido con retraso: ¿suena un pitido lanzado por un temporizador? ----
  const probarSonidoConRetraso = crearPruebaDeSonido({
    sonido: app.sonido,
    voz: app.voz,
    crearGrabadora: () => crearGrabadora({ maximoSegundos: 5 }),
    config: CONFIG,
  });
  function hacerPruebaDeSonido() {
    cajaDeDiagnostico.hidden = false;
    botonCopiar.hidden = false;
    cajaDeDiagnostico.value = 'Escucha: un pitido ahora; después se graban 2 segundos con el micrófono (si pide permiso, acéptalo); luego dos pitidos más y al final la voz. No toques nada más hasta que salga el resultado, unos 10 segundos…';
    probarSonidoConRetraso((lineas) => {
      cajaDeDiagnostico.value = [
        ...lineas,
        `Versión de la app: ${app.version ?? 'desconocida'}`,
        `App instalada: ${lineasDeEstado[0]}`,
        `Interruptor de pitidos: ${app.sonido.estaActivo() ? 'encendido' : 'apagado'}`,
        `Navegador: ${navigator.userAgent}`,
      ].join('\n');
    });
  }

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
        h('button', { class: 'boton', onclick: hacerPruebaDeSonido }, 'Prueba de sonido con retraso'),
        h('p', { class: 'suave pequeno' }, 'Tienen que oírse tres pitidos (uno al pulsar y dos más después de grabar) y al final la voz. Tras el primer pitido graba 2 segundos con el micrófono: lo grabado no se guarda ni se envía. Sirve para saber si los pitidos suenan cuando los lanza el temporizador, y si todo sigue sonando después de grabar.'),
        h('button', { class: 'boton', onclick: hacerDiagnostico }, 'Diagnóstico de voces'),
        h('p', { class: 'suave pequeno' }, 'Dice una frase y enseña todas las voces que da el dispositivo y cuál usa la app. Es un texto para copiar y pegar.'),
        cajaDeDiagnostico,
        botonCopiar,
      ),
      h('p', { class: 'aviso' }, CONFIG.avisoInicial),
    ],
  });
  return { nodo, alSalir: dejarDeEscucharVoces };
}
