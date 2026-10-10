// Pantalla PROVISIONAL de la fase 2: prueba del micrófono. Mantener pulsado graba; al soltar,
// se reproduce lo grabado. No transcribe ni envía nada, y el audio no se guarda en ningún sitio.
// Sirve para saber si «Hablar» (5.8) se puede hacer así en la app instalada en el iPhone.

import { CONFIG } from '../config.js';
import { h, pantalla, poner } from '../dom.js';
import { crearGrabadora, explicarError, loQueFalta } from '../microfono.js';

export function microfono(app) {
  let direccion = null; // dirección interna del último audio, para poder liberarla
  let contador = null;

  const estado = h('p', { class: 'estado', role: 'status' }, 'Mantén pulsado el botón mientras hablas.');
  const segundos = h('span', { class: 'cifra', 'aria-live': 'off' }, '0');
  const resultado = h('div', { class: 'tarjeta', hidden: true });
  const hablar = h('button', { class: 'boton boton-principal boton-hablar' }, 'Mantén pulsado para hablar');

  const grabadora = crearGrabadora({
    maximoSegundos: CONFIG.maximoDeGrabacionSegundos,
    alTerminarSola: (grabacion) => mostrar(grabacion, true),
  });

  function liberarAudio() {
    if (direccion) URL.revokeObjectURL(direccion);
    direccion = null;
  }

  function pararContador() {
    clearInterval(contador);
    contador = null;
    hablar.classList.remove('grabando');
  }

  function mostrar(grabacion, porTope = false) {
    pararContador();
    if (!grabacion || grabacion.audio.size === 0) {
      estado.textContent = 'No se ha grabado nada. Mantén pulsado un par de segundos.';
      return;
    }
    liberarAudio();
    direccion = URL.createObjectURL(grabacion.audio);
    const reproductor = h('audio', { controls: true, src: direccion, class: 'audio' });
    estado.textContent = porTope
      ? `Grabación cortada al llegar a ${CONFIG.maximoDeGrabacionSegundos} segundos. Pulsa ▶ para oírla.`
      : 'Grabado. Si no suena solo, pulsa ▶ para oírlo.';
    resultado.hidden = false;
    poner(
      resultado,
      h('h2', {}, 'Lo que se ha grabado'),
      reproductor,
      h('p', { class: 'suave pequeno' }, `Duración: ${String(grabacion.segundos).replace('.', ',')} s · Formato: ${grabacion.formato || 'no indicado'} · Tamaño: ${Math.round(grabacion.audio.size / 1024)} KB`),
      h('p', { class: 'suave pequeno' }, 'Este audio no se ha enviado a ningún sitio y se borra al salir de esta pantalla.'),
    );
    // Puede que el iPhone no deje reproducir sin un toque: para eso están los controles.
    reproductor.play?.().catch(() => {});
  }

  async function alPulsar(evento) {
    evento.preventDefault();
    // La voz de la app se calla: si hablara mientras graba, se grabaría a sí misma.
    app.voz.callar();
    estado.textContent = 'Preparando el micrófono…';
    try {
      const grabando = await grabadora.empezar();
      if (!grabando) {
        estado.textContent = 'Has soltado antes de que el micrófono estuviera listo. Prueba otra vez.';
        return;
      }
      estado.textContent = 'Grabando… suelta para terminar.';
      hablar.classList.add('grabando');
      segundos.textContent = '0';
      contador = setInterval(() => {
        segundos.textContent = String(grabadora.segundos());
      }, 250);
    } catch (error) {
      pararContador();
      estado.textContent = explicarError(error);
    }
  }

  async function alSoltar(evento) {
    evento.preventDefault();
    const estabaGrabando = grabadora.grabando();
    const grabacion = await grabadora.soltar();
    if (estabaGrabando) mostrar(grabacion);
    else pararContador();
  }

  hablar.addEventListener('pointerdown', alPulsar);
  for (const tipo of ['pointerup', 'pointercancel', 'pointerleave']) hablar.addEventListener(tipo, alSoltar);
  // Que mantener pulsado no abra el menú de copiar ni seleccione texto.
  hablar.addEventListener('contextmenu', (evento) => evento.preventDefault());

  const faltas = loQueFalta();
  const instalada =
    globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone === true;

  const nodo = pantalla({
    cabecera: [
      h('button', { class: 'boton boton-plano', onclick: () => app.ir('ajustes') }, '‹ Ajustes'),
      h('h1', {}, 'Prueba del micrófono'),
    ],
    contenido: [
      h('p', { class: 'aviso' }, 'Pantalla provisional. Graba y reproduce: no transcribe ni envía nada.'),
      h('p', { class: 'suave pequeno' }, instalada ? 'Abierta como app instalada.' : 'Abierta en el navegador, no como app instalada.'),
      faltas.length > 0
        ? h('div', { class: 'aviso aviso-peligro' }, h('p', {}, 'Aquí no se puede grabar:'), faltas.map((falta) => h('p', {}, falta)))
        : [estado, h('p', { class: 'marcador' }, segundos, h('span', { class: 'bajo-cifra' }, 'segundos')), resultado],
    ],
    pie: faltas.length > 0 ? [] : [hablar],
  });

  return {
    nodo,
    alSalir() {
      pararContador();
      grabadora.cancelar();
      liberarAudio();
    },
  };
}
