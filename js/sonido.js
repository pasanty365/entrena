// Pitidos suaves de los últimos segundos de cada cuenta atrás, hechos con Web Audio
// (el generador de sonido del navegador): no hace falta ningún archivo de audio.
//
// En el iPhone el sonido solo arranca después de un toque (sección 9): el botón «Empezar»
// llama a `desbloquear()`. En ese mismo toque se pide el modo «playback», para que los
// pitidos suenen aunque el iPhone esté en silencio (solo se puede comprobar en el iPhone).

import { CONFIG } from './config.js';

export function crearSonido({
  CrearContexto = globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null,
  navegador = globalThis.navigator ?? null,
  config = CONFIG,
} = {}) {
  const disponible = Boolean(CrearContexto);
  let activo = true;
  let contexto = null;

  function desbloquear() {
    if (!disponible) return;
    try {
      if (navegador?.audioSession) navegador.audioSession.type = 'playback';
    } catch {
      // Si el navegador no deja cambiarlo, se sigue sin ello.
    }
    if (!contexto) contexto = new CrearContexto();
    if (contexto.state === 'suspended') contexto.resume();
  }

  function pitido() {
    if (!disponible || !activo || !contexto) return false;
    if (contexto.state === 'suspended') contexto.resume();
    const ahora = contexto.currentTime;
    const dura = config.pitidoMs / 1000;
    const oscilador = contexto.createOscillator();
    const volumen = contexto.createGain();
    oscilador.type = 'sine';
    oscilador.frequency.value = config.pitidoHz;
    // Sube y baja el volumen en rampa para que no haga «clic».
    volumen.gain.setValueAtTime(0, ahora);
    volumen.gain.linearRampToValueAtTime(config.pitidoVolumen, ahora + 0.01);
    volumen.gain.linearRampToValueAtTime(0, ahora + dura);
    oscilador.connect(volumen);
    volumen.connect(contexto.destination);
    oscilador.start(ahora);
    oscilador.stop(ahora + dura + 0.02);
    return true;
  }

  return {
    disponible,
    desbloquear,
    pitido,
    activar(valor) {
      activo = Boolean(valor);
    },
    estaActivo: () => activo,
    alEvento(evento) {
      return evento.tipo === 'pitido' ? pitido() : false;
    },
  };
}
