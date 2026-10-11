// Prueba de sonido con retraso (Ajustes → Pruebas). Sirve para comprobar en el iPhone lo que
// en el Mac no se puede ver: si un sonido lanzado por un temporizador, y no por un toque, suena.
//
// Pasos, uno detrás de otro, con un solo toque:
//   0 s   Pitido dentro del toque, y empieza una grabación corta con el micrófono.
//   2 s   Se suelta el micrófono. (Grabar cambia el «modo de sonido» del iPhone: hay que ver
//         que después todo vuelve a sonar.)
//   5 s   Pitido por el camino nuevo: un reproductor de audio normal (el que usan los pitidos).
//   8 s   Pitido por el camino antiguo: el generador de sonido del navegador (Web Audio), que es
//         el que fallaba. Se apunta en qué estado está cuando le toca sonar: esa es la causa.
//   10 s  La voz dice «Prueba terminada» y se enseña el resultado.

export function crearPruebaDeSonido({
  sonido,
  voz = null,
  crearGrabadora = null, // () => grabadora de `microfono.js`; sin ella, la prueba no graba
  navegador = globalThis.navigator ?? null,
  CrearContexto = globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null,
  programar = (accion, ms) => setTimeout(accion, ms),
  config,
}) {
  // Se llama dentro de un toque. `alAcabar` recibe las líneas del resultado.
  return function probar(alAcabar) {
    const lineas = [];
    const antes = sonido.diagnostico().intentos.length;
    const modo = () => navegador?.audioSession?.type ?? 'este navegador no lo dice';
    voz?.desbloquear();
    sonido.desbloquear(); // suena un pitido dentro del toque
    lineas.push(`Modo de sonido tras el pitido del toque: ${modo()}`);

    // La grabación corta: como «Hablar», justo después de que la app haya sonado.
    const grabadora = crearGrabadora?.() ?? null;
    let grabacion = 'no se ha probado';
    if (grabadora) {
      grabacion = 'no llegó a empezar';
      grabadora.empezar().then(
        (grabando) => {
          grabacion = grabando ? 'empezó' : 'no llegó a empezar';
          lineas.push(`Modo de sonido mientras graba: ${modo()}`);
        },
        (error) => {
          grabacion = `ERROR ${error?.name ?? ''}: ${error?.message ?? ''}`.trim();
        },
      );
      programar(() => {
        grabadora.soltar().then(
          (resultado) => {
            if (resultado) grabacion = `grabó ${String(resultado.segundos).replace('.', ',')} s, ${Math.round(resultado.audio.size / 1024)} KB, ${resultado.formato || 'formato no indicado'}`;
            lineas.push(`Modo de sonido al soltar el micrófono: ${modo()}`);
          },
          () => {},
        );
      }, 2000);
    }

    // El camino antiguo se prepara igual que estaba: se crea y se activa dentro del toque,
    // sin hacer sonar nada, que es lo que pasaba al pulsar «Empezar».
    let contexto = null;
    try {
      if (CrearContexto) {
        contexto = new CrearContexto();
        if (contexto.state === 'suspended') contexto.resume();
        lineas.push(`Camino antiguo, dentro del toque: estado «${contexto.state}»`);
      } else {
        lineas.push('Camino antiguo: este navegador no lo tiene');
      }
    } catch (error) {
      lineas.push(`Camino antiguo, dentro del toque: error ${error.name}: ${error.message}`);
    }

    // A los 5 segundos, sin ningún toque: un pitido por el camino nuevo.
    programar(() => {
      sonido.pitido(0);
    }, 5000);

    // A los 8 segundos: un pitido por el camino antiguo, apuntando su estado.
    programar(async () => {
      if (contexto) {
        const estadoAlLlegar = contexto.state;
        let reactivar = 'no hizo falta';
        if (estadoAlLlegar !== 'running') {
          try {
            await Promise.race([contexto.resume(), new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('no contesta')), 1500))]);
            reactivar = 'aceptado';
          } catch (error) {
            reactivar = `rechazado (${error.name}: ${error.message})`;
          }
        }
        try {
          const ahora = contexto.currentTime;
          const oscilador = contexto.createOscillator();
          const volumen = contexto.createGain();
          oscilador.frequency.value = config.pitidoHz;
          volumen.gain.value = config.pitidoVolumen;
          oscilador.connect(volumen);
          volumen.connect(contexto.destination);
          oscilador.start(ahora);
          oscilador.stop(ahora + config.pitidoMs / 1000);
        } catch (error) {
          lineas.push(`Camino antiguo, al sonar: error ${error.name}: ${error.message}`);
        }
        lineas.push(
          `Camino antiguo, a los 8 s desde un temporizador: estado al llegar «${estadoAlLlegar}» · reactivarlo: ${reactivar} · estado después «${contexto.state}»`,
        );
      }
    }, 8000);

    // A los 10 segundos habla la voz y se recoge todo.
    programar(() => {
      voz?.decir('Prueba terminada.', { interrumpir: true, aunqueEsteApagada: true });
      const nuevos = sonido.diagnostico().intentos.slice(antes);
      const describir = (intento) => `${intento.lanzadoPor}: ${intento.bien ? 'el navegador lo aceptó' : `el navegador lo rechazó (${intento.error})`}`;
      alAcabar([
        'PRUEBA DE SONIDO CON RETRASO',
        'Tenías que oír TRES pitidos (al pulsar, a los 5 segundos y a los 8) y al final la voz: «Prueba terminada».',
        `Grabación corta entre el primer pitido y el segundo: ${grabacion}`,
        `Camino nuevo (reproductor normal): ${nuevos.length > 0 ? nuevos.map(describir).join(' · ') : 'no se llegó a intentar (¿pitidos apagados?)'}`,
        ...lineas,
        `Pitidos por la voz de reserva: ${sonido.diagnostico().fallaDesdeElTemporizador ? 'SÍ, el camino nuevo falló desde el temporizador' : 'no ha hecho falta'}`,
      ]);
      contexto?.close?.();
    }, 10000);
  };
}
