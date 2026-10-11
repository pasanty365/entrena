// Prueba de sonido con retraso (Ajustes → Pruebas). Sirve para comprobar en el iPhone lo que
// en el Mac no se puede ver: si un sonido lanzado por un temporizador, y no por un toque, suena,
// también después de haber usado el micrófono.
//
// Pasos, uno detrás de otro, con un solo toque:
//   1. Pitido dentro del toque, y se pide el micrófono.
//   2. Cuando el micrófono está listo (el iPhone puede tardar, o preguntar por el permiso),
//      se graban 2 segundos y se suelta. Grabar cambia el «modo de sonido» del iPhone: hay que
//      ver que después todo vuelve a sonar.
//   3. A los 3 segundos de soltar: pitido por el camino nuevo, un reproductor de audio normal
//      (el que usan los pitidos).
//   4. A los 6 segundos: pitido por el camino antiguo, el generador de sonido del navegador
//      (Web Audio), que es el que fallaba. Se apunta en qué estado está cuando le toca sonar.
//   5. A los 8 segundos: la voz dice «Prueba terminada» y se enseña el resultado.

export function crearPruebaDeSonido({
  sonido,
  voz = null,
  crearGrabadora = null, // () => grabadora de `microfono.js`; sin ella, la prueba no graba
  navegador = globalThis.navigator ?? null,
  CrearContexto = globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null,
  programar = (accion, ms) => setTimeout(accion, ms),
  reloj = Date.now,
  config,
}) {
  // Se llama dentro de un toque. `alAcabar` recibe las líneas del resultado.
  return function probar(alAcabar) {
    const lineas = [];
    const antes = sonido.diagnostico().intentos.length;
    const modo = () => navegador?.audioSession?.type ?? 'este navegador no lo dice';
    const segundosDesde = (inicio) => String(Math.round((reloj() - inicio) / 100) / 10).replace('.', ',');
    voz?.desbloquear();
    sonido.desbloquear(); // suena un pitido dentro del toque
    lineas.push(`Modo de sonido tras el pitido del toque: ${modo()}`);

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

    // La grabación corta: como «Hablar», justo después de que la app haya sonado.
    // Los 2 segundos se cuentan desde que el micrófono está listo, no desde el toque: el iPhone
    // puede tardar en entregarlo (más con AirPods) o preguntar antes por el permiso.
    const grabadora = crearGrabadora?.() ?? null;
    let grabacion = 'no se ha probado';
    if (!grabadora) {
      elResto();
    } else {
      const pedido = reloj();
      grabacion = 'el micrófono no llegó a estar listo';
      grabadora.empezar().then(
        (grabando) => {
          lineas.push(`El micrófono tardó ${segundosDesde(pedido)} s en estar listo`);
          lineas.push(`Modo de sonido mientras graba: ${modo()}`);
          if (!grabando) {
            grabacion = 'no llegó a empezar';
            elResto();
            return;
          }
          grabacion = 'empezó, pero no devolvió audio';
          programar(() => {
            grabadora.soltar().then(
              (resultado) => {
                if (resultado) grabacion = `grabó ${String(resultado.segundos).replace('.', ',')} s, ${Math.round(resultado.audio.size / 1024)} KB, ${resultado.formato || 'formato no indicado'}`;
                lineas.push(`Modo de sonido al soltar el micrófono: ${modo()}`);
                elResto();
              },
              (error) => {
                grabacion = `ERROR al soltar ${error?.name ?? ''}: ${error?.message ?? ''}`.trim();
                elResto();
              },
            );
          }, 2000);
        },
        (error) => {
          grabacion = `ERROR ${error?.name ?? ''}: ${error?.message ?? ''}`.trim();
          lineas.push(`Modo de sonido tras el fallo del micrófono: ${modo()}`);
          elResto();
        },
      );
    }

    // Lo que viene después de la grabación, todo lanzado por temporizadores, sin ningún toque.
    function elResto() {
      // A los 3 segundos: un pitido por el camino nuevo.
      programar(() => {
        sonido.pitido(0);
      }, 3000);

      // A los 6 segundos: un pitido por el camino antiguo, apuntando su estado.
      programar(async () => {
        if (!contexto) return;
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
          `Camino antiguo, desde un temporizador: estado al llegar «${estadoAlLlegar}» · reactivarlo: ${reactivar} · estado después «${contexto.state}»`,
        );
      }, 6000);

      // A los 8 segundos habla la voz y se recoge todo.
      programar(() => {
        voz?.decir('Prueba terminada.', { interrumpir: true, aunqueEsteApagada: true });
        const nuevos = sonido.diagnostico().intentos.slice(antes);
        const describir = (intento) => `${intento.lanzadoPor}: ${intento.bien ? 'el navegador lo aceptó' : `el navegador lo rechazó (${intento.error})`}`;
        alAcabar([
          'PRUEBA DE SONIDO CON RETRASO',
          'Tenías que oír TRES pitidos (al pulsar, y dos más después de la grabación) y al final la voz: «Prueba terminada».',
          `Grabación corta después del primer pitido: ${grabacion}`,
          `Camino nuevo (reproductor normal): ${nuevos.length > 0 ? nuevos.map(describir).join(' · ') : 'no se llegó a intentar (¿pitidos apagados?)'}`,
          ...lineas,
          `Pitidos por la voz de reserva: ${sonido.diagnostico().fallaDesdeElTemporizador ? 'SÍ, el camino nuevo falló desde el temporizador' : 'no ha hecho falta'}`,
        ]);
        contexto?.close?.();
      }, 8000);
    }
  };
}
