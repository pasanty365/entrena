// Motor del reproductor: lleva el estado de una sesión en marcha, sin pantalla ni sonido.
// La pantalla, la voz y los pitidos se enteran de lo que pasa por los eventos (`alEvento`).
//
// Los tiempos se calculan con la hora de fin de cada paso, no sumando intervalos (sección 9):
// si la app pasa a segundo plano y el reloj «se duerme», al volver se recalcula con la hora real.
//
// Uso: crearMotor({...}), `empezar()` y luego llamar a `tic()` varias veces por segundo.

import { CONFIG } from './config.js';
import { pasosDeEntrada } from './catalogo.js';
import { segundosPorRepeticion } from './duracion.js';

export function crearMotor({
  sesion, // { id, titulo, esRutina }
  entradas, // de `entradasDeSesion`
  ajustes, // { segundosPreparacion, segundosCambioLado }
  config = CONFIG,
  reloj = Date.now, // devuelve la hora en milisegundos; en las pruebas es un reloj falso
  alEvento = () => {},
  instantanea = null, // para «Seguir donde lo dejaste»
}) {
  // 'sin-empezar' | 'activa' | 'fin' | 'detenida'
  let fase = 'sin-empezar';
  let pausado = false;
  let pausaDesdeMs = null;
  let motivoDeParada = null;

  let lista = entradas.slice();
  let iEntrada = 0;
  let desdeSerie = 1;
  let pasos = [];
  let iPaso = 0;

  let inicioMs = 0; // cuándo empezó el paso actual
  let finMs = null; // cuándo termina; null si el paso espera a un botón
  let marcas = new Set(); // avisos ya dados en este paso
  let ultimaFase = null;
  let anclaDescansoMs = null; // cuándo acabó la serie: el descanso cuenta desde ahí, también mientras se registra
  let reanunciar = false; // tras restaurar, al reanudar se vuelve a anunciar el paso

  let inicioSesionMs = null;
  let finSesionMs = null;
  let pausadoTotalMs = 0;

  const registros = [];
  const incidencias = [];
  const completadas = new Set(); // índices de los ejercicios hechos hasta el final

  const emitir = (evento) => alEvento(evento);
  const entradaActual = () => lista[iEntrada] ?? null;
  const pasoActual = () => pasos[iPaso] ?? null;
  // Mientras está en pausa, el tiempo «se congela» en el momento de pausar.
  const ahora = () => (pausado ? pausaDesdeMs : reloj());

  function transcurridoMs() {
    if (inicioSesionMs === null) return 0;
    return (finSesionMs ?? ahora()) - inicioSesionMs - pausadoTotalMs;
  }

  function anunciarPaso() {
    const paso = pasoActual();
    const entrada = entradaActual();
    if (paso.tipo === 'preparacion') {
      emitir({ tipo: 'preparacion', entrada, numero: iEntrada + 1, total: lista.length, desdeSerie });
    } else if (paso.tipo === 'trabajo') {
      emitir({
        tipo: 'trabajo',
        entrada,
        serie: paso.serie,
        series: entrada.series,
        lado: paso.lado,
        modo: paso.modo,
      });
    } else if (paso.tipo === 'cambio-lado') {
      emitir({ tipo: 'cambio-lado', segundos: paso.segundos });
    } else if (paso.tipo === 'registro') {
      const siguiente = pasos[iPaso + 1];
      emitir({
        tipo: 'registro',
        entrada,
        serie: paso.serie,
        series: entrada.series,
        descansoSegundos: siguiente?.tipo === 'descanso' ? siguiente.segundos : null,
      });
    } else if (paso.tipo === 'descanso') {
      emitir({
        tipo: 'descanso',
        segundos: Math.max(0, Math.ceil((finMs - ahora()) / 1000)),
        // Si viene de un registro, la voz ya dijo «Descanso, N segundos» al acabar la serie.
        yaAnunciado: pasos[iPaso - 1]?.tipo === 'registro',
      });
    }
  }

  function entrarEnPaso(inicio) {
    const paso = pasoActual();
    marcas = new Set();
    ultimaFase = null;
    inicioMs = inicio;
    finMs = paso.segundos != null ? inicio + paso.segundos * 1000 : null;

    if (paso.tipo === 'registro') {
      anclaDescansoMs = inicio;
    } else if (paso.tipo === 'descanso' && anclaDescansoMs !== null) {
      // El descanso empezó al acabar la serie, no al guardar el registro.
      inicioMs = anclaDescansoMs;
      finMs = anclaDescansoMs + paso.segundos * 1000;
      anclaDescansoMs = null;
      if (finMs <= reloj()) {
        avanzar(reloj());
        return;
      }
    } else {
      anclaDescansoMs = null;
    }
    anunciarPaso();
  }

  function avanzar(inicio) {
    iPaso += 1;
    if (iPaso >= pasos.length) {
      completadas.add(iEntrada);
      irAEntrada(iEntrada + 1, inicio);
    } else {
      entrarEnPaso(inicio);
    }
  }

  function irAEntrada(indice, inicio, serie = 1) {
    iEntrada = indice;
    desdeSerie = serie;
    if (iEntrada >= lista.length) {
      terminar();
      return;
    }
    pasos = pasosDeEntrada(entradaActual(), ajustes, desdeSerie);
    iPaso = 0;
    entrarEnPaso(inicio);
  }

  function terminar() {
    fase = 'fin';
    finSesionMs = reloj();
    pasos = [];
    iPaso = 0;
    finMs = null;
    emitir({ tipo: 'fin', resumen: resumen() });
  }

  // Avisos que dependen del tiempo dentro del paso actual.
  function avisosDelPaso(t) {
    const paso = pasoActual();
    const entrada = entradaActual();
    const restanteMs = finMs - t;
    const transcurrido = t - inicioMs;

    if (paso.tipo === 'trabajo' && paso.modo === 'fases') {
      const fases = entrada.ejercicio.fases;
      const porRepeticionMs = segundosPorRepeticion(entrada.ejercicio) * 1000;
      const repeticion = Math.min(entrada.repeticiones - 1, Math.floor(transcurrido / porRepeticionMs));
      let dentro = transcurrido - repeticion * porRepeticionMs;
      let iFase = 0;
      while (iFase < fases.length - 1 && dentro >= fases[iFase].segundos * 1000) {
        dentro -= fases[iFase].segundos * 1000;
        iFase += 1;
      }
      const clave = `${repeticion}:${iFase}`;
      if (clave !== ultimaFase && restanteMs > 0) {
        ultimaFase = clave;
        emitir({
          tipo: 'fase',
          texto: fases[iFase].texto,
          indice: iFase,
          repeticion: repeticion + 1,
          repeticiones: entrada.repeticiones,
        });
      }
    }

    if (
      paso.tipo === 'trabajo' &&
      paso.modo === 'tiempo' &&
      entrada.ejercicio.avisoMitad &&
      !marcas.has('mitad') &&
      transcurrido >= (paso.segundos * 1000) / 2 &&
      restanteMs > 0
    ) {
      marcas.add('mitad');
      emitir({ tipo: 'aviso-mitad', texto: entrada.ejercicio.avisoMitad });
    }

    if (paso.tipo === 'descanso') avisoDeQuedan(paso.segundos, restanteMs);

    const quedan = Math.ceil(restanteMs / 1000);
    if (quedan >= 1 && quedan <= config.segundosDePitidos && !marcas.has(`pitido:${quedan}`)) {
      // Si se vuelve tarde de un segundo plano, suena solo el pitido que toca, no los atrasados.
      for (let k = quedan; k <= config.segundosDePitidos; k += 1) marcas.add(`pitido:${k}`);
      emitir({ tipo: 'pitido', quedan });
    }
  }

  function avisoDeQuedan(totalSegundos, restanteMs) {
    const aviso = config.avisoQuedanSegundos;
    if (
      totalSegundos >= config.avisoQuedanMinimoSegundos &&
      !marcas.has('quedan') &&
      restanteMs <= aviso * 1000
    ) {
      marcas.add('quedan');
      // Si ya queda bastante menos (se volvió tarde), no se dice una cifra que ya no es verdad.
      if (restanteMs > (aviso - 2) * 1000) emitir({ tipo: 'quedan', segundos: aviso });
    }
  }

  // Lo que queda del descanso mientras se está registrando la serie (o null si no hay descanso después).
  function descansoPendienteMs(t) {
    const siguiente = pasos[iPaso + 1];
    if (pasoActual()?.tipo !== 'registro' || siguiente?.tipo !== 'descanso') return null;
    return anclaDescansoMs + siguiente.segundos * 1000 - t;
  }

  function tic() {
    if (fase !== 'activa' || pausado) return;
    for (let guarda = 0; guarda < 1000; guarda += 1) {
      if (fase !== 'activa') return;
      const t = reloj();
      const paso = pasoActual();

      if (paso.tipo === 'registro') {
        const pendiente = descansoPendienteMs(t);
        if (pendiente !== null) {
          avisoDeQuedan(pasos[iPaso + 1].segundos, pendiente);
          if (pendiente <= 0 && !marcas.has('descanso-cumplido')) {
            marcas.add('descanso-cumplido');
            emitir({ tipo: 'descanso-cumplido' });
          }
        }
        return;
      }
      if (finMs === null) return; // espera a «Hecho»

      avisosDelPaso(t);
      if (t < finMs) return;
      // Si el retraso es pequeño, el siguiente paso empieza a la hora teórica: no se acumula desfase.
      // Si es grande (la app estuvo dormida), empieza ahora: no se «recupera» a ciegas lo perdido.
      const retraso = t - finMs;
      avanzar(retraso <= config.retrasoMaximoSinReajusteMs ? finMs : t);
    }
  }

  function empezar() {
    if (fase !== 'sin-empezar') return;
    if (lista.length === 0) throw new Error('La sesión no tiene ejercicios.');
    fase = 'activa';
    inicioSesionMs = reloj();
    irAEntrada(0, inicioSesionMs);
  }

  function pausar() {
    if (fase !== 'activa' || pausado) return;
    pausaDesdeMs = reloj();
    pausado = true;
    emitir({ tipo: 'pausa' });
  }

  function reanudar() {
    if (fase !== 'activa' || !pausado) return;
    const desplazamiento = reloj() - pausaDesdeMs;
    pausado = false;
    pausaDesdeMs = null;
    pausadoTotalMs += desplazamiento;
    // Todo lo que dependía de la hora se desplaza lo que ha durado la pausa.
    inicioMs += desplazamiento;
    if (finMs !== null) finMs += desplazamiento;
    if (anclaDescansoMs !== null) anclaDescansoMs += desplazamiento;
    if (reanunciar) {
      reanunciar = false;
      anunciarPaso();
    } else {
      emitir({ tipo: 'reanuda' });
    }
  }

  // «Hecho»: termina una serie (o un lado) de un ejercicio de tipo `series`.
  function hecho() {
    const paso = pasoActual();
    if (fase !== 'activa' || pausado || paso?.tipo !== 'trabajo' || paso.modo !== 'manual') return;
    avanzar(reloj());
  }

  // «Siguiente»: pasa siempre al ejercicio siguiente, esté en el paso que esté.
  // Lo que falte del actual queda apuntado como saltado.
  function siguiente() {
    if (fase !== 'activa') return;
    if (pausado) reanudarEnSilencio();
    incidencias.push({
      tipo: 'saltado',
      ejercicioId: entradaActual().ejercicio.id,
      serie: pasoActual().serie ?? desdeSerie,
      momentoMs: transcurridoMs(),
    });
    irAEntrada(iEntrada + 1, reloj());
  }

  // Serie por la que se retoma un ejercicio al volver a él: la primera sin apunte.
  // Si no hay ninguna apuntada, la primera; si están todas, la última, para poder repetirla.
  function serieParaRetomar(indice) {
    const entrada = lista[indice];
    const apuntadas = new Set(registros.filter((r) => r.iEntrada === indice).map((r) => r.serie));
    for (let serie = 1; serie <= entrada.series; serie += 1) {
      if (!apuntadas.has(serie)) return serie;
    }
    return entrada.series;
  }

  // «Anterior»: vuelve al ejercicio anterior (en el primero, al propio ejercicio), a la serie que
  // toca según lo apuntado y empezando por su preparación.
  function anterior() {
    if (fase !== 'activa') return;
    if (pausado) reanudarEnSilencio();
    const destino = Math.max(0, iEntrada - 1);
    incidencias.push({
      tipo: 'vuelta-atras',
      ejercicioId: entradaActual().ejercicio.id,
      a: lista[destino].ejercicio.id,
      momentoMs: transcurridoMs(),
    });
    irAEntrada(destino, reloj(), serieParaRetomar(destino));
  }

  // «Empezar ya» y «Saltar descanso»: acaba la espera en curso (preparación, cambio de lado
  // o descanso) y pasa a lo siguiente. Fuera de una espera no hace nada.
  function saltarEspera() {
    const paso = pasoActual();
    if (fase !== 'activa' || pausado || !paso) return false;
    if (!['preparacion', 'cambio-lado', 'descanso'].includes(paso.tipo)) return false;
    avanzar(reloj());
    return true;
  }

  // «No apuntar»: deja sin registro la serie que se acaba de hacer y sigue.
  function noApuntar() {
    if (fase !== 'activa' || pasoActual()?.tipo !== 'registro') return false;
    if (pausado) reanudarEnSilencio();
    avanzar(reloj());
    return true;
  }

  // Quita la pausa sin decir «Seguimos»: lo que venga después ya se anuncia solo.
  function reanudarEnSilencio() {
    const desplazamiento = reloj() - pausaDesdeMs;
    pausado = false;
    pausaDesdeMs = null;
    pausadoTotalMs += desplazamiento;
    if (anclaDescansoMs !== null) anclaDescansoMs += desplazamiento;
    reanunciar = false;
  }

  // Lo que el registro propone, ya relleno: lo previsto y, en el peso, lo último que se apuntó.
  function registroPrevisto() {
    const entrada = entradaActual();
    const anterior = registros.findLast((r) => r.iEntrada === iEntrada);
    return {
      repeticiones: entrada.modo === 'tiempo' ? null : entrada.repeticiones,
      segundos: entrada.modo === 'tiempo' ? entrada.segundos : null,
      pesoKg: entrada.conPeso ? (anterior?.pesoKg ?? entrada.pesoKg ?? 0) : null,
      // El margen solo se pregunta en los ejercicios con repeticiones (5.4 y 4.3).
      pideMargen: entrada.modo !== 'tiempo',
    };
  }

  function numeroValido(valor) {
    return valor == null || (Number.isFinite(valor) && valor >= 0);
  }

  // Guarda el registro de la serie y sigue.
  function registrar({ repeticiones = null, segundos = null, pesoKg = null, margen = null } = {}) {
    const paso = pasoActual();
    if (fase !== 'activa' || paso?.tipo !== 'registro') return false;
    if (![repeticiones, segundos, pesoKg].every(numeroValido)) {
      throw new Error('El registro tiene un número que no es válido.');
    }
    if (margen !== null && !config.margenes.includes(margen)) {
      throw new Error(`Margen desconocido: «${margen}».`);
    }
    if (pausado) reanudarEnSilencio();
    const registro = {
      iEntrada,
      ejercicioId: entradaActual().ejercicio.id,
      serie: paso.serie,
      repeticiones,
      segundos,
      pesoKg,
      margen,
      momentoMs: transcurridoMs(),
    };
    // Si esta serie ya estaba apuntada (se ha repetido), el apunte nuevo sustituye al viejo.
    const viejo = registros.findIndex((r) => r.iEntrada === iEntrada && r.serie === paso.serie);
    if (viejo >= 0) registros.splice(viejo, 1);
    registros.push(registro);
    emitir({ tipo: 'registro-guardado', registro });
    avanzar(reloj());
    return true;
  }

  // «Cambiar ejercicio»: sustituye el ejercicio actual por una alternativa (ya convertida en
  // entrada con `entradaAlternativa`). Sigue por la serie que tocaba.
  function cambiarEjercicio(nuevaEntrada) {
    const paso = pasoActual();
    if (fase !== 'activa' || !paso) return false;
    // Con un registro a medias no se cambia: antes hay que guardarlo o saltarlo.
    if (paso.tipo === 'registro') return false;
    const serie =
      paso.tipo === 'preparacion' ? desdeSerie : paso.tipo === 'descanso' ? paso.serie + 1 : paso.serie;
    incidencias.push({
      tipo: 'cambiado',
      ejercicioId: entradaActual().ejercicio.id,
      por: nuevaEntrada.ejercicio.id,
      serie,
      momentoMs: transcurridoMs(),
    });
    if (pausado) reanudarEnSilencio();
    lista[iEntrada] = nuevaEntrada;
    desdeSerie = serie;
    pasos = pasosDeEntrada(nuevaEntrada, ajustes, desdeSerie);
    iPaso = 0;
    entrarEnPaso(reloj());
    return true;
  }

  // Apunta algo que ha pasado (por ejemplo, que se pulsó «Me duele»).
  function anotar(tipo, datos = {}) {
    incidencias.push({
      tipo,
      ejercicioId: entradaActual()?.ejercicio.id ?? null,
      momentoMs: transcurridoMs(),
      ...datos,
    });
  }

  // Para la sesión del todo. Con `motivo` 'alarma' («No me encuentro bien») no se puede reanudar.
  function detener(motivo) {
    if (fase !== 'activa' && fase !== 'sin-empezar') return;
    if (inicioSesionMs === null) inicioSesionMs = reloj();
    finSesionMs = ahora();
    anotar(motivo);
    fase = 'detenida';
    pausado = false;
    pausaDesdeMs = null;
    motivoDeParada = motivo;
    finMs = null;
    emitir({ tipo: 'detenida', motivo, resumen: resumen() });
  }

  // Cambia el texto de «Mis ajustes» del ejercicio actual (lo guarda la app aparte).
  function ponerMisAjustes(texto) {
    const entrada = entradaActual();
    if (entrada) lista[iEntrada] = { ...entrada, misAjustes: texto };
  }

  function resumen() {
    return {
      sesionId: sesion.id,
      titulo: sesion.titulo,
      terminada: fase === 'fin',
      duracionSegundos: Math.round(transcurridoMs() / 1000),
      ejerciciosTotales: lista.length,
      ejerciciosCompletados: completadas.size,
      registros: registros.slice(),
      incidencias: incidencias.slice(),
    };
  }

  // Lo que la pantalla necesita para pintarse.
  function vista() {
    const paso = pasoActual();
    const entrada = entradaActual();
    const t = ahora();
    const base = {
      fase,
      pausado,
      motivoDeParada,
      sesion,
      numero: Math.min(iEntrada + 1, lista.length),
      total: lista.length,
      transcurridoSegundos: Math.round(transcurridoMs() / 1000),
    };
    if (fase !== 'activa' || !paso) return { ...base, entrada: null, paso: null };

    let repeticion = null;
    let textoDeFase = null;
    if (paso.tipo === 'trabajo' && paso.modo === 'fases') {
      const fases = entrada.ejercicio.fases;
      const porRepeticionMs = segundosPorRepeticion(entrada.ejercicio) * 1000;
      const transcurrido = Math.max(0, t - inicioMs);
      const indice = Math.min(entrada.repeticiones - 1, Math.floor(transcurrido / porRepeticionMs));
      let dentro = transcurrido - indice * porRepeticionMs;
      let iFase = 0;
      while (iFase < fases.length - 1 && dentro >= fases[iFase].segundos * 1000) {
        dentro -= fases[iFase].segundos * 1000;
        iFase += 1;
      }
      repeticion = { actual: indice + 1, total: entrada.repeticiones };
      textoDeFase = fases[iFase].texto;
    }

    const pendiente = descansoPendienteMs(t);
    return {
      ...base,
      entrada,
      siguienteEntrada: lista[iEntrada + 1] ?? null,
      paso: { tipo: paso.tipo, serie: paso.serie ?? desdeSerie, lado: paso.lado ?? null, modo: paso.modo ?? null },
      series: entrada.series,
      totalSegundos: paso.segundos ?? null,
      restanteSegundos: finMs === null ? null : Math.max(0, Math.ceil((finMs - t) / 1000)),
      repeticion,
      textoDeFase,
      registro: paso.tipo === 'registro' ? registroPrevisto() : null,
      descansoPendienteSegundos: pendiente === null ? null : Math.max(0, Math.ceil(pendiente / 1000)),
      puedeCambiar: paso.tipo !== 'registro' && entrada.alternativas.length > 0,
    };
  }

  // Foto del estado para guardarla y poder «Seguir donde lo dejaste». Se puede pasar a JSON.
  function hacerInstantanea() {
    if (fase !== 'activa') return null;
    const t = ahora();
    return {
      version: 1,
      sesion,
      entradas: lista,
      iEntrada,
      iPaso,
      desdeSerie,
      restanteMs: finMs === null ? null : Math.max(0, finMs - t),
      desdeAnclaMs: anclaDescansoMs === null ? null : t - anclaDescansoMs,
      transcurridoMs: transcurridoMs(),
      registros: registros.slice(),
      incidencias: incidencias.slice(),
      completadas: [...completadas],
    };
  }

  // Deja el motor donde estaba la instantánea, en pausa. Al reanudar, vuelve a anunciar el paso.
  function restaurar(foto) {
    if (foto.version !== 1) throw new Error('La sesión guardada es de otra versión.');
    const t = reloj();
    lista = foto.entradas.slice();
    iEntrada = foto.iEntrada;
    desdeSerie = foto.desdeSerie;
    pasos = pasosDeEntrada(entradaActual(), ajustes, desdeSerie);
    iPaso = foto.iPaso;
    const paso = pasoActual();
    if (!paso) throw new Error('La sesión guardada no se puede recuperar.');
    registros.push(...foto.registros);
    incidencias.push(...foto.incidencias);
    // Las fotos antiguas guardaban solo cuántos; las nuevas, cuáles.
    const hechas = Array.isArray(foto.completadas)
      ? foto.completadas
      : Array.from({ length: foto.completadas ?? 0 }, (_, i) => i);
    for (const indice of hechas) completadas.add(indice);
    fase = 'activa';
    pausado = true;
    pausaDesdeMs = t;
    pausadoTotalMs = 0;
    inicioSesionMs = t - foto.transcurridoMs;
    marcas = new Set();
    ultimaFase = null;
    if (foto.restanteMs === null) {
      finMs = null;
      inicioMs = t;
    } else {
      finMs = t + foto.restanteMs;
      inicioMs = finMs - paso.segundos * 1000;
    }
    anclaDescansoMs = foto.desdeAnclaMs === null ? null : t - foto.desdeAnclaMs;
    reanunciar = true;
  }

  if (instantanea) restaurar(instantanea);

  return {
    empezar,
    tic,
    pausar,
    reanudar,
    hecho,
    siguiente,
    anterior,
    saltarEspera,
    noApuntar,
    registrar,
    cambiarEjercicio,
    anotar,
    detener,
    ponerMisAjustes,
    vista,
    resumen,
    instantanea: hacerInstantanea,
  };
}
