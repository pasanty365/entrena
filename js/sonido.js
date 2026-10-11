// Pitidos suaves de los últimos segundos de cada cuenta atrás.
//
// Camino: un sonido corto que la app genera al vuelo y reproduce con un reproductor de audio
// normal (el mismo tipo que usa cualquier página para un archivo de sonido).
//
// Por qué así (prueba en el iPhone, 11/10/2026): con el generador de sonido del
// navegador (Web Audio), el pitido sonaba justo después de un toque, pero no cuando lo lanzaba
// el temporizador de la sesión. Un reproductor normal queda autorizado por el iPhone desde
// que suena una vez dentro de un toque, y después puede sonar solo.
//
// Por eso `desbloquear()`, que se llama dentro del toque de «Empezar», hace sonar un pitido
// de verdad. Si un pitido lanzado por el temporizador falla, se avisa con `alFallar`, y la app
// dice la cuenta con la voz («tres», «dos», «uno»).

import { CONFIG } from './config.js';

// Un pitido como archivo WAV (sonido sin comprimir), en bytes. Función pura.
// Sube y baja el volumen en rampa al principio y al final para que no haga «clic».
export function ondaDePitido({ hz, ms, volumen, muestrasPorSegundo = 22050 }) {
  const muestras = Math.round((muestrasPorSegundo * ms) / 1000);
  const rampa = Math.max(1, Math.round(muestrasPorSegundo * 0.012));
  const bytes = new Uint8Array(44 + muestras * 2);
  const vista = new DataView(bytes.buffer);
  const texto = (posicion, cadena) => [...cadena].forEach((letra, i) => vista.setUint8(posicion + i, letra.charCodeAt(0)));
  texto(0, 'RIFF');
  vista.setUint32(4, 36 + muestras * 2, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  vista.setUint32(16, 16, true); // tamaño del bloque de formato
  vista.setUint16(20, 1, true); // sin comprimir
  vista.setUint16(22, 1, true); // un canal
  vista.setUint32(24, muestrasPorSegundo, true);
  vista.setUint32(28, muestrasPorSegundo * 2, true);
  vista.setUint16(32, 2, true);
  vista.setUint16(34, 16, true); // 16 bits por muestra
  texto(36, 'data');
  vista.setUint32(40, muestras * 2, true);
  for (let i = 0; i < muestras; i += 1) {
    const envolvente = Math.min(1, i / rampa, (muestras - 1 - i) / rampa);
    const valor = Math.sin((2 * Math.PI * hz * i) / muestrasPorSegundo) * volumen * envolvente;
    vista.setInt16(44 + i * 2, Math.round(valor * 32767), true);
  }
  return bytes;
}

export function crearSonido({
  CrearAudio = globalThis.Audio ?? null,
  crearDireccion = (bytes) => URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })),
  navegador = globalThis.navigator ?? null,
  config = CONFIG,
  alFallar = () => {},
} = {}) {
  const disponible = Boolean(CrearAudio);
  let activo = true;
  let reproductor = null;
  let fallaDesdeElTemporizador = false;
  const intentos = []; // los últimos, para el diagnóstico de Ajustes

  function apuntar(lanzadoPor, bien, error = null) {
    intentos.push({ lanzadoPor, bien, error: error ? `${error.name ?? 'Error'}: ${error.message ?? ''}`.trim() : null });
    if (intentos.length > 20) intentos.shift();
  }

  function sonar(lanzadoPor, dato) {
    try {
      reproductor.currentTime = 0;
    } catch {
      // Hay navegadores que no dejan rebobinar antes de cargar: se sigue.
    }
    let promesa;
    try {
      promesa = reproductor.play();
    } catch (error) {
      promesa = Promise.reject(error);
    }
    Promise.resolve(promesa).then(
      () => apuntar(lanzadoPor, true),
      (error) => {
        apuntar(lanzadoPor, false, error);
        if (lanzadoPor === 'temporizador') {
          fallaDesdeElTemporizador = true;
          alFallar(dato);
        }
      },
    );
  }

  // Se llama dentro de un toque («Empezar», «Seguir donde lo dejaste», «Probar»).
  function desbloquear() {
    try {
      // Modo de sonido que no hace caso del interruptor de silencio del iPhone (sección 9).
      if (navegador?.audioSession) navegador.audioSession.type = 'playback';
    } catch {
      // Si el navegador no deja cambiarlo, se sigue sin ello.
    }
    if (!disponible || !activo) return false;
    if (!reproductor) {
      reproductor = new CrearAudio();
      reproductor.preload = 'auto';
      reproductor.src = crearDireccion(
        ondaDePitido({ hz: config.pitidoHz, ms: config.pitidoMs, volumen: config.pitidoVolumen }),
      );
    }
    // Un toque nuevo es una oportunidad nueva: se vuelve a intentar el camino normal.
    fallaDesdeElTemporizador = false;
    // Suena un pitido de verdad: es lo que le da permiso al iPhone para los que vengan después.
    sonar('toque');
    return true;
  }

  // Un pitido lanzado por el temporizador de la sesión. `dato` es lo que se le pasa a `alFallar`.
  function pitido(dato) {
    if (!activo) return false;
    if (!disponible || !reproductor || fallaDesdeElTemporizador) {
      // Sin reproductor, o si ya se vio que el iPhone no lo deja sonar solo: va por la voz.
      if (disponible && !reproductor) return false; // todavía no ha habido ningún toque
      alFallar(dato);
      return false;
    }
    sonar('temporizador', dato);
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
      return evento.tipo === 'pitido' ? pitido(evento.quedan) : false;
    },
    // Para Ajustes → Pruebas.
    diagnostico: () => ({ intentos: intentos.slice(), fallaDesdeElTemporizador, hayReproductor: Boolean(reproductor) }),
  };
}

// Lo que dice la voz si el pitido no puede sonar: la cuenta, en una palabra.
export function palabraDeCuenta(quedan) {
  return { 3: 'Tres', 2: 'Dos', 1: 'Uno' }[quedan] ?? null;
}
