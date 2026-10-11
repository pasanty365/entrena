// Grabación con el micrófono para «pulsar para hablar» (5.8 y sección 9).
// En la fase 2 solo se usa en la pantalla provisional de prueba: graba y reproduce.
// Aquí no se envía nada a ningún sitio ni se guarda nada: el audio vive en memoria
// hasta que se sale de la pantalla.

// Formatos de audio, por orden de preferencia. El iPhone graba en «mp4»; otros navegadores, en «webm».
export const FORMATOS = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

// El primer formato que el navegador dice que sabe grabar, o '' para dejarle elegir.
export function formatoDeGrabacion(sabeGrabar, formatos = FORMATOS) {
  if (typeof sabeGrabar !== 'function') return '';
  return formatos.find((formato) => sabeGrabar(formato)) ?? '';
}

// Qué le falta al navegador para poder grabar. Lista vacía si no le falta nada.
export function loQueFalta({ navegador = globalThis.navigator, Grabadora = globalThis.MediaRecorder, seguro = globalThis.isSecureContext } = {}) {
  const faltas = [];
  if (seguro === false) faltas.push('La página no es segura (hace falta https o localhost).');
  if (!navegador?.mediaDevices?.getUserMedia) faltas.push('El navegador no da acceso al micrófono (getUserMedia).');
  if (!Grabadora) faltas.push('El navegador no sabe grabar (MediaRecorder).');
  return faltas;
}

// Explica en castellano por qué ha fallado el micrófono.
export function explicarError(error) {
  const nombre = error?.name ?? '';
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
    return 'No hay permiso para usar el micrófono. Se concede en Ajustes del iPhone, en los permisos de la app o de Safari.';
  }
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') return 'No se ha encontrado ningún micrófono.';
  if (nombre === 'NotReadableError' || nombre === 'AbortError') return 'El micrófono está ocupado o no responde.';
  return `El micrófono ha fallado: ${nombre || 'error desconocido'}${error?.message ? ` (${error.message})` : ''}.`;
}

// Una grabación de «mantener pulsado». `empezar()` pide el micrófono y graba; `soltar()` para,
// suelta el micrófono (para que no quede el indicador encendido) y devuelve el audio.
// Si se suelta antes de que el micrófono esté listo, no se graba nada.
export function crearGrabadora({
  navegador = globalThis.navigator,
  Grabadora = globalThis.MediaRecorder,
  reloj = Date.now,
  maximoSegundos = 60,
  alTerminarSola = () => {},
} = {}) {
  let flujo = null;
  let grabadora = null;
  let trozos = [];
  let inicioMs = null;
  let pulsado = false;
  let tope = null;
  let resolverFin = null;

  // El iPhone tiene un «modo de sonido» por app. Para que la voz y los pitidos suenen con el
  // interruptor en silencio, la app pone el modo «playback» (solo reproducir); pero en ese modo
  // el iPhone no deja grabar. Por eso, antes de pedir el micrófono se pasa a «play-and-record»
  // (reproducir y grabar) y, al soltarlo, se vuelve a «playback».
  function ponerModoDeSonido(tipo) {
    try {
      if (navegador?.audioSession) navegador.audioSession.type = tipo;
    } catch {
      // Si el navegador no deja cambiarlo, se sigue sin ello.
    }
  }

  function soltarMicrofono() {
    const habia = Boolean(flujo);
    flujo?.getTracks().forEach((pista) => pista.stop());
    flujo = null;
    if (habia) ponerModoDeSonido('playback');
  }

  async function empezar() {
    if (pulsado) return false;
    pulsado = true;
    trozos = [];
    let nuevo;
    ponerModoDeSonido('play-and-record');
    try {
      nuevo = await navegador.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      pulsado = false;
      ponerModoDeSonido('playback');
      throw error;
    }
    if (!pulsado) {
      // Se soltó el botón mientras el iPhone preguntaba por el permiso.
      nuevo.getTracks().forEach((pista) => pista.stop());
      ponerModoDeSonido('playback');
      return false;
    }
    flujo = nuevo;
    const formato = formatoDeGrabacion(Grabadora.isTypeSupported?.bind(Grabadora));
    grabadora = formato ? new Grabadora(flujo, { mimeType: formato }) : new Grabadora(flujo);
    grabadora.ondataavailable = (evento) => {
      if (evento.data && evento.data.size > 0) trozos.push(evento.data);
    };
    grabadora.onstop = () => {
      const tipo = grabadora.mimeType || formato || trozos[0]?.type || '';
      const resultado = {
        audio: new Blob(trozos, tipo ? { type: tipo } : undefined),
        formato: tipo,
        segundos: Math.round((reloj() - inicioMs) / 100) / 10,
      };
      soltarMicrofono();
      grabadora = null;
      resolverFin?.(resultado);
      resolverFin = null;
    };
    inicioMs = reloj();
    grabadora.start();
    // Tope de duración: si se llega, la grabación termina sola.
    tope = setTimeout(() => {
      soltar().then((resultado) => resultado && alTerminarSola(resultado));
    }, maximoSegundos * 1000);
    return true;
  }

  function soltar() {
    clearTimeout(tope);
    tope = null;
    if (!pulsado) return Promise.resolve(null);
    pulsado = false;
    if (!grabadora || grabadora.state === 'inactive') {
      soltarMicrofono();
      return Promise.resolve(null);
    }
    return new Promise((resolver) => {
      resolverFin = resolver;
      grabadora.stop();
    });
  }

  return {
    empezar,
    soltar,
    grabando: () => Boolean(grabadora && grabadora.state === 'recording'),
    segundos: () => (inicioMs === null || !grabadora ? 0 : Math.floor((reloj() - inicioMs) / 1000)),
    // Por si se sale de la pantalla a mitad: para y suelta el micrófono sin devolver nada.
    cancelar() {
      clearTimeout(tope);
      pulsado = false;
      if (grabadora && grabadora.state !== 'inactive') {
        grabadora.onstop = null;
        grabadora.stop();
      }
      grabadora = null;
      soltarMicrofono();
    },
  };
}
