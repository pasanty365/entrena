// Voz de la app: convierte los eventos del motor en frases y las dice con `speechSynthesis`
// (la voz que trae el navegador), en castellano de España.
//
// En el iPhone la voz solo arranca después de un toque en la pantalla (sección 9):
// por eso el botón «Empezar» llama a `desbloquear()` y la primera frase sale en ese mismo toque.

import { CONFIG } from './config.js';

const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;

// Los decimales, con coma, para que la voz diga «dos coma cinco».
function numero(n) {
  return String(n).replace('.', ',');
}

// «3 series de 10 repeticiones por lado, con 20 kilos».
export function loQueToca(entrada) {
  const cantidad =
    entrada.modo === 'tiempo'
      ? plural(entrada.segundos, 'segundo', 'segundos')
      : plural(entrada.repeticiones, 'repetición', 'repeticiones');
  let texto = entrada.series > 1 ? `${numero(entrada.series)} series de ${cantidad}` : cantidad;
  if (entrada.ejercicio.porLado) texto += ' por lado';
  if (entrada.pesoKg) texto += `, con ${plural(entrada.pesoKg, 'kilo', 'kilos')}`;
  return texto;
}

// Frase que corresponde a un evento del motor, o null si no hay nada que decir.
export function fraseDe(evento, config = CONFIG) {
  switch (evento.tipo) {
    case 'preparacion': {
      const { entrada } = evento;
      const partes = [`Prepárate: ${entrada.ejercicio.nombre}.`];
      if (entrada.misAjustes) partes.push(`${entrada.misAjustes.replace(/[.\s]+$/, '')}.`);
      partes.push(`${loQueToca(entrada)}.`);
      return partes.join(' ');
    }
    case 'trabajo': {
      const partes = [];
      if (evento.series > 1) partes.push(`Serie ${evento.serie} de ${evento.series}.`);
      if (evento.lado) partes.push(`Lado ${evento.lado}.`);
      // En los dinámicos, la primera fase («Sube», «Inclina»…) ya hace de señal de salida.
      if (evento.modo === 'tiempo') partes.push('Empieza.');
      if (evento.modo === 'manual') {
        const primeraVez = evento.serie === 1 && evento.lado !== 'derecho';
        partes.push(primeraVez ? 'Empieza. Pulsa «Hecho» al terminar.' : 'Empieza.');
      }
      return partes.length > 0 ? partes.join(' ') : null;
    }
    case 'fase':
    case 'aviso-mitad':
      return evento.texto;
    case 'cambio-lado':
      return 'Cambia de lado.';
    case 'registro':
      return evento.descansoSegundos
        ? `Descanso, ${plural(evento.descansoSegundos, 'segundo', 'segundos')}. Apunta la serie.`
        : 'Apunta la serie.';
    case 'descanso':
      return evento.yaAnunciado ? null : `Descanso, ${plural(evento.segundos, 'segundo', 'segundos')}.`;
    case 'quedan':
      return `Quedan ${plural(evento.segundos, 'segundo', 'segundos')}.`;
    case 'descanso-cumplido':
      return 'Descanso terminado. Apunta la serie para seguir.';
    case 'pausa':
      return 'Pausa.';
    case 'reanuda':
      return 'Seguimos.';
    case 'fin':
      return 'Sesión terminada.';
    case 'detenida':
      return evento.motivo === 'alarma' ? config.avisoDeAlarma : null;
    default:
      return null;
  }
}

// ¿Esta frase debe cortar lo que se esté diciendo? Las fases de un dinámico duran 2 o 3 segundos:
// si se pusieran a la cola, la voz iría con retraso. La primera fase no corta, para no
// comerse el «Serie 2 de 3» que va justo antes.
function interrumpe(evento) {
  if (evento.tipo === 'fase') return evento.repeticion > 1 || evento.indice > 0;
  // Al empezar un paso nuevo se corta lo anterior: mejor una frase cortada que una orden con retraso.
  return ['pausa', 'detenida', 'preparacion', 'trabajo', 'cambio-lado', 'registro', 'fin'].includes(
    evento.tipo,
  );
}

const idiomaNormal = (lang) => String(lang ?? '').replace('_', '-').toLowerCase();

// Lo que identifica a una voz para poder guardarla en Ajustes.
export const idDeVoz = (voz) => voz.voiceURI || voz.name;

// De las voces del dispositivo, la del idioma pedido; si no hay, otra en español.
// Si en Ajustes se eligió una (`preferida`) y el dispositivo la sigue teniendo, manda esa.
export function elegirVoz(voces, idioma = CONFIG.idiomaDeVoz, preferida = null) {
  if (preferida) {
    const elegida = voces.find((voz) => idDeVoz(voz) === preferida);
    if (elegida) return elegida;
  }
  const exactas = voces.filter((voz) => idiomaNormal(voz.lang) === idioma.toLowerCase());
  const candidatas =
    exactas.length > 0 ? exactas : voces.filter((voz) => idiomaNormal(voz.lang).startsWith('es'));
  // Entre las candidatas, mejor una instalada en el dispositivo: funciona sin conexión.
  return candidatas.find((voz) => voz.localService) ?? candidatas[0] ?? null;
}

// Las voces en español del dispositivo, para el selector de Ajustes:
// primero las del idioma de la app (España) y, dentro de cada grupo, por nombre.
export function vocesEnEspanol(voces, idioma = CONFIG.idiomaDeVoz) {
  const deLaApp = (voz) => (idiomaNormal(voz.lang) === idioma.toLowerCase() ? 0 : 1);
  return voces
    .filter((voz) => idiomaNormal(voz.lang).startsWith('es'))
    .sort((a, b) => deLaApp(a) - deLaApp(b) || a.name.localeCompare(b.name, 'es'));
}

const PAISES = {
  'es-es': 'España',
  'es-mx': 'México',
  'es-us': 'Estados Unidos',
  'es-ar': 'Argentina',
  'es-co': 'Colombia',
  'es-cl': 'Chile',
  'es-419': 'Latinoamérica',
};

// «Mónica · España · mejorada». La calidad se deduce del identificador que da iOS
// (compact, enhanced, premium); si no lo dice, no se pone nada.
export function etiquetaDeVoz(voz) {
  // Algunos dispositivos ya ponen el idioma en el nombre («Eddy (español (España))»): no se repite.
  const partes = voz.name.includes('(') ? [voz.name] : [voz.name, PAISES[idiomaNormal(voz.lang)] ?? voz.lang];
  const id = String(voz.voiceURI ?? '').toLowerCase();
  if (id.includes('premium')) partes.push('premium');
  else if (id.includes('enhanced')) partes.push('mejorada');
  return partes.join(' · ');
}

// Texto para copiar y pegar con todo lo que se sabe de las voces del dispositivo. Sirve para
// averiguar por qué una voz no cambia o no aparece: si es cosa de la app o un límite del iPhone.
//   voces:   todas las que da el dispositivo (no solo las de español), tal cual.
//   elegida: el identificador guardado en Ajustes (o null).
//   enUso:   la voz que la app pone en cada frase.
//   ultima:  lo que pasó con la última frase dicha ({ texto, voz, idioma, eventos }).
//   entorno: datos sueltos del dispositivo ({ clave: valor }).
export function diagnosticoDeVoces({ voces = [], elegida = null, enUso = null, ultima = null, entorno = {} } = {}) {
  const siNo = (valor) => (valor === true ? 'sí' : valor === false ? 'no' : '?');
  const linea = (voz, i) =>
    `${String(i + 1).padStart(2, ' ')}. ${voz.name} | ${voz.lang} | ${voz.voiceURI || '(sin identificador)'} | local: ${siNo(voz.localService)} | por defecto: ${siNo(voz.default)}`;
  const esEspanol = (voz) => idiomaNormal(voz.lang).startsWith('es');
  const espanol = voces.filter(esEspanol);
  const resto = voces.filter((voz) => !esEspanol(voz));
  const lineas = ['DIAGNÓSTICO DE VOCES DE ENTRENA'];
  for (const [clave, valor] of Object.entries(entorno)) lineas.push(`${clave}: ${valor}`);
  lineas.push(
    `Voces que da el dispositivo: ${voces.length} (en español: ${espanol.length})`,
    `Voz elegida en Ajustes: ${elegida ?? 'automática'}`,
    `Voz que la app pone en la frase: ${enUso ? `${enUso.name} | ${enUso.lang} | ${idDeVoz(enUso)}` : 'ninguna (decide el dispositivo)'}`,
    `¿La elegida sigue en la lista?: ${elegida ? siNo(voces.some((voz) => idDeVoz(voz) === elegida)) : 'no aplica'}`,
  );
  if (ultima) {
    lineas.push(
      `Última frase: «${ultima.texto}»`,
      `  voz puesta: ${ultima.voz ?? 'ninguna'} | idioma puesto: ${ultima.idioma}`,
      `  lo que contestó el dispositivo: ${ultima.eventos.length > 0 ? ultima.eventos.join(', ') : 'nada todavía'}`,
    );
  } else {
    lineas.push('Última frase: ninguna todavía');
  }
  lineas.push('', 'EN ESPAÑOL (nombre | idioma | identificador | local | por defecto)', ...(espanol.length > 0 ? espanol.map(linea) : ['(ninguna)']));
  lineas.push('', 'RESTO', ...(resto.length > 0 ? resto.map(linea) : ['(ninguna)']));
  return lineas.join('\n');
}

export function crearVoz({
  sintetizador = globalThis.speechSynthesis ?? null,
  CrearFrase = globalThis.SpeechSynthesisUtterance ?? null,
  navegador = globalThis.navigator ?? null,
  config = CONFIG,
} = {}) {
  const disponible = Boolean(sintetizador && CrearFrase);
  let activa = true;
  let preferida = null; // la voz elegida en Ajustes, o null para la automática
  let ultima = null; // lo que pasó con la última frase, para el diagnóstico

  // `con` fuerza una voz concreta para esa frase: lo usa el botón «Oír» de Ajustes.
  function decir(texto, { interrumpir = false, con = undefined, aunqueEsteApagada = false } = {}) {
    if (!disponible || !texto || (!activa && !aunqueEsteApagada)) return false;
    if (interrumpir) sintetizador.cancel();
    const frase = new CrearFrase(texto);
    const voz = elegirVoz(sintetizador.getVoices(), config.idiomaDeVoz, con === undefined ? preferida : con);
    // Con una voz elegida de otro país, la frase lleva el idioma de esa voz.
    frase.lang = voz?.lang ? String(voz.lang).replace('_', '-') : config.idiomaDeVoz;
    if (voz) frase.voice = voz;
    // Se apunta qué se pidió y qué contesta el dispositivo, para el diagnóstico de Ajustes.
    const apunte = { texto, voz: voz ? `${voz.name} | ${idDeVoz(voz)}` : null, idioma: frase.lang, eventos: [] };
    ultima = apunte;
    frase.onstart = (evento) => apunte.eventos.push(`empezó (voz según el dispositivo: ${evento?.utterance?.voice?.name ?? 'no lo dice'})`);
    frase.onend = () => apunte.eventos.push('terminó');
    frase.onerror = (evento) => apunte.eventos.push(`error: ${evento?.error ?? 'desconocido'}`);
    sintetizador.speak(frase);
    return true;
  }

  // Modo de sonido que no hace caso del interruptor de silencio del iPhone (sección 9).
  // Hay que pedirlo dentro de un toque, y lo necesita cualquier botón que haga hablar a la app.
  function sonarAunqueEsteEnSilencio() {
    try {
      if (navegador?.audioSession) navegador.audioSession.type = 'playback';
    } catch {
      // Si el navegador no deja cambiarlo, se sigue sin ello.
    }
  }

  return {
    disponible,
    decir,
    // Se llama dentro del toque de «Empezar».
    desbloquear() {
      sonarAunqueEsteEnSilencio();
      if (!disponible) return;
      sintetizador.cancel();
      sintetizador.resume?.();
    },
    callar() {
      if (disponible) sintetizador.cancel();
    },
    activar(valor) {
      activa = Boolean(valor);
      if (!activa) this.callar();
    },
    estaActiva: () => activa,
    // Para el diagnóstico: todas las voces tal cual las da el dispositivo, y la última frase dicha.
    todasLasVoces: () => (disponible ? Array.from(sintetizador.getVoices()) : []),
    ultimaLocucion: () => ultima,
    // Voz elegida en Ajustes (su identificador), o null para dejar la automática.
    elegir(id) {
      preferida = id || null;
    },
    vozElegida: () => preferida,
    // Las voces en español que ofrece ahora mismo el dispositivo.
    voces: () => (disponible ? vocesEnEspanol(sintetizador.getVoices(), config.idiomaDeVoz) : []),
    // La que se usará de verdad (por si la elegida ya no está en el dispositivo).
    vozEnUso: () => (disponible ? elegirVoz(sintetizador.getVoices(), config.idiomaDeVoz, preferida) : null),
    // El iPhone entrega la lista de voces con retraso: avisa cuando cambia. Devuelve cómo dejar de escuchar.
    alCambiarVoces(aviso) {
      if (!disponible || !sintetizador.addEventListener) return () => {};
      sintetizador.addEventListener('voiceschanged', aviso);
      return () => sintetizador.removeEventListener('voiceschanged', aviso);
    },
    alEvento(evento) {
      const frase = fraseDe(evento, config);
      // Un paso nuevo corta lo anterior aunque él mismo no tenga nada que decir.
      if (!frase && interrumpe(evento)) this.callar();
      return decir(frase, { interrumpir: interrumpe(evento) });
    },
  };
}
