// El reproductor: una tarjeta por ejercicio, la cifra grande, el registro de series
// y los botones siempre visibles (5.4). Toda la lógica está en `motor.js`; aquí solo se pinta.

import { botonera } from '../botonera.js';
import { entradaAlternativa } from '../catalogo.js';
import { CONFIG } from '../config.js';
import { abrirHoja, h, icono, poner } from '../dom.js';
import { crearMotor } from '../motor.js';
import { ajustar, textoDeCuenta, textoNumero } from '../numeros.js';
import { fechaDeHoy, queToca, textoDeEstado, textoDeProgreso } from '../textos.js';

// Eventos del motor que cambian lo que hay en pantalla (los demás solo suenan).
const REPINTAN = new Set(['preparacion', 'trabajo', 'cambio-lado', 'registro', 'descanso', 'pausa', 'reanuda']);

// Esta pantalla no es `async`: tiene que arrancar dentro del toque de «Empezar»,
// para que el iPhone deje sonar la voz (sección 9).
export function reproductor(app, { sesion, entradas = [], instantanea = null }) {
  const raiz = h('div', { class: 'pantalla reproductor' });
  const nodos = {}; // los que cambian varias veces por segundo
  let cerrarHoja = null;
  let borrador = null; // lo que se está apuntando en el registro de la serie
  let acabado = false;
  let bloqueoDePantalla = null;

  const motor = crearMotor({
    sesion: instantanea?.sesion ?? sesion,
    entradas,
    ajustes: app.catalogo.ajustes,
    instantanea,
    alEvento,
  });

  function alEvento(evento) {
    app.voz.alEvento(evento);
    app.sonido.alEvento(evento);
    if (evento.tipo === 'registro') borrador = null;
    if (evento.tipo === 'fin') {
      acabar('fin');
      return;
    }
    if (REPINTAN.has(evento.tipo)) {
      pintar();
      guardar();
    }
  }

  // Guarda dónde va la sesión, para «Seguir donde lo dejaste».
  function guardar() {
    const foto = motor.instantanea();
    if (foto && !acabado) app.almacen.guardarSesionAMedias(foto).catch(() => {});
  }

  // La sesión se acaba (termina, se corta o salta la alarma): se apunta en el historial.
  function acabar(destino, datos = {}) {
    if (acabado) return;
    acabado = true;
    cerrar();
    const resumen = motor.resumen();
    app.almacen.borrarSesionAMedias().catch(() => {});
    // `guardada` avisa de con qué número queda en el historial (o null si no se pudo guardar).
    const guardada = app.almacen
      .guardarSesionHecha({ fecha: new Date().toISOString(), ...resumen })
      .catch(() => null);
    app.ir(destino, { resumen, guardada, ...datos });
  }

  function cerrar() {
    cerrarHoja?.();
    cerrarHoja = null;
  }

  function hoja(...hijos) {
    cerrar();
    cerrarHoja = abrirHoja(...hijos);
  }

  // Pausa mientras hay un panel abierto. Devuelve cómo volver a como estaba.
  function pausarParaPanel() {
    const yaEstabaEnPausa = motor.vista().pausado;
    motor.pausar();
    return () => {
      cerrar();
      if (!yaEstabaEnPausa) motor.reanudar();
    };
  }

  // ---- Acciones ----

  // Para al primer toque. Antes de parar se guarda una foto de la sesión, por si fue sin querer:
  // la pantalla del aviso ofrece «Lo he pulsado sin querer», que vuelve aquí donde estaba.
  function alarma() {
    cerrar();
    motor.pausar();
    const instantanea = motor.instantanea();
    motor.detener('alarma'); // la voz dice el aviso
    app.almacen.guardarDato('alarmaFecha', fechaDeHoy()).catch(() => {});
    acabar('alarma', { instantanea });
  }

  function terminarAntes() {
    cerrar();
    app.voz.callar();
    motor.detener('terminada-antes');
    acabar('fin');
  }

  // Versión mínima de la fase 1: pausa y deja elegir. El flujo completo de 7.2
  // (dónde, cuánto y cómo es el dolor) llega en la fase 3.
  function meDuele() {
    const volver = pausarParaPanel();
    motor.anotar('me-duele');
    const v = motor.vista();
    hoja(
      h('h2', {}, 'Sesión en pausa'),
      h('p', {}, 'Si algo te duele, para. ¿Qué quieres hacer?'),
      h('button', { class: 'boton', onclick: () => { cerrar(); motor.siguiente(); } }, 'Saltar este ejercicio'),
      v.puedeCambiar && h('button', { class: 'boton', onclick: () => { cerrar(); cambiarEjercicio(); } }, 'Cambiar ejercicio'),
      h('button', { class: 'boton', onclick: volver }, 'Seguir con este ejercicio'),
      h('button', { class: 'boton', onclick: terminarAntes }, 'Terminar la sesión'),
      h('button', { class: 'boton boton-alarma', onclick: alarma }, 'No me encuentro bien'),
    );
  }

  function cambiarEjercicio() {
    const volver = pausarParaPanel();
    const { entrada } = motor.vista();
    const elegir = async (id) => {
      const nueva = entradaAlternativa(entrada, id, app.catalogo);
      if (nueva.ejercicio.maquina) nueva.misAjustes = await app.almacen.misAjustes(id);
      cerrar();
      motor.cambiarEjercicio(nueva);
    };
    hoja(
      h('h2', {}, 'Cambiar ejercicio'),
      h('p', { class: 'suave' }, `En lugar de «${entrada.ejercicio.nombre}»:`),
      entrada.alternativas.map((id) =>
        h('button', { class: 'boton', onclick: () => elegir(id) }, app.catalogo.buscar(id).nombre),
      ),
      h('button', { class: 'boton boton-plano', onclick: volver }, 'No cambiar'),
    );
  }

  function salir() {
    const volver = pausarParaPanel();
    hoja(
      h('h2', {}, '¿Salir de la sesión?'),
      h(
        'button',
        {
          class: 'boton boton-principal',
          onclick: async () => {
            app.voz.callar();
            const foto = motor.instantanea();
            if (foto) await app.almacen.guardarSesionAMedias(foto);
            acabado = true; // ya no se guarda más desde aquí
            cerrar();
            app.ir('inicio');
          },
        },
        'Salir y seguir luego',
      ),
      h('button', { class: 'boton', onclick: terminarAntes }, 'Terminar la sesión'),
      h('button', { class: 'boton boton-plano', onclick: volver }, 'Volver a la sesión'),
    );
  }

  function editarMisAjustes() {
    const volver = pausarParaPanel();
    const { entrada } = motor.vista();
    const campo = h('input', {
      class: 'campo',
      type: 'text',
      value: entrada.misAjustes,
      placeholder: 'Asiento 4, respaldo 2',
      maxLength: 80,
      'aria-label': 'Mis ajustes de esta máquina',
    });
    const guardarTexto = async () => {
      const texto = campo.value.trim();
      await app.almacen.guardarMisAjustes(entrada.ejercicio.id, texto);
      motor.ponerMisAjustes(texto);
      volver();
      pintar();
    };
    hoja(
      h('h2', {}, 'Mis ajustes'),
      h('p', { class: 'suave' }, `${entrada.ejercicio.nombre}. La voz lo dirá al preparar el ejercicio.`),
      campo,
      h('button', { class: 'boton boton-principal', onclick: guardarTexto }, 'Guardar'),
      h('button', { class: 'boton boton-plano', onclick: volver }, 'Cancelar'),
    );
  }

  function guardarRegistro(margen = null) {
    motor.registrar({ ...borrador, margen });
  }

  // ---- Pintar ----

  // El marco de la imagen, o nada si el ejercicio no tiene: ese sitio queda para las indicaciones.
  function tarjetaDeImagen(ejercicio) {
    const sabida = app.imagenEnMemoria(ejercicio.id);
    if (sabida === null) return null;
    const marco = h('div', { class: 'imagen', hidden: !sabida });
    const colocar = (url) => {
      if (!url) return;
      poner(marco, h('img', { src: url, alt: '' }));
      marco.hidden = false;
    };
    if (sabida) colocar(sabida);
    else app.urlDeImagen(ejercicio.id).then(colocar);
    return marco;
  }

  function contador(etiqueta, unidad, campo, paso) {
    const valor = h('span', {}, textoNumero(borrador[campo]));
    const mover = (cuanto) => {
      borrador[campo] = ajustar(borrador[campo], cuanto);
      valor.textContent = textoNumero(borrador[campo]);
    };
    return h(
      'div',
      { class: 'contador', role: 'group', 'aria-label': etiqueta },
      h('button', { class: 'boton', 'aria-label': `Menos ${unidad}`, onclick: () => mover(-paso) }, '−'),
      h('div', { class: 'contador-valor', 'aria-live': 'polite' }, valor, h('span', { class: 'contador-unidad' }, unidad)),
      h('button', { class: 'boton', 'aria-label': `Más ${unidad}`, onclick: () => mover(paso) }, '+'),
    );
  }

  function contenidoDelRegistro(v) {
    borrador ??= {
      repeticiones: v.registro.repeticiones,
      segundos: v.registro.segundos,
      pesoKg: v.registro.pesoKg,
    };
    // El descanso que corre mientras se apunta, en grande: es lo que se mira desde lejos.
    nodos.descanso = h('span', { class: 'cifra', role: 'timer', 'aria-live': 'off' });
    nodos.bajoDescanso = h('span', { class: 'bajo-cifra' });
    nodos.marcadorDescanso = h('p', { class: 'marcador' }, nodos.descanso, nodos.bajoDescanso);
    return [
      h('h2', { class: 'nombre' }, v.entrada.ejercicio.nombre),
      h('p', { class: 'estado' }, textoDeEstado(v)),
      nodos.marcadorDescanso,
      borrador.repeticiones !== null && contador('Repeticiones', 'repeticiones', 'repeticiones', CONFIG.pasoRepeticiones),
      borrador.segundos !== null && contador('Segundos', 'segundos', 'segundos', CONFIG.pasoSegundos),
      borrador.pesoKg !== null && contador('Peso', 'kg', 'pesoKg', CONFIG.pasoPesoKg),
      v.registro.pideMargen
        ? [
            h('p', { class: 'que-toca' }, '¿Cuánto margen te quedaba?'),
            h(
              'div',
              { class: 'botones' },
              CONFIG.margenes.map((margen) =>
                h('button', { class: 'boton boton-principal', onclick: () => guardarRegistro(margen) }, margen),
              ),
            ),
          ]
        : h('button', { class: 'boton boton-principal', onclick: () => guardarRegistro() }, 'Guardar'),
      boton(botonera(v).registro, 'boton-plano boton-ancho'),
    ];
  }

  // La tarjeta, por orden de prioridad cuando falta sitio:
  // primero la cifra y lo que toca; después las indicaciones enteras; la imagen, con lo que sobre.
  function contenidoDeLaTarjeta(v, botones) {
    const { entrada } = v;
    const { ejercicio } = entrada;
    nodos.cifra = h('span', { class: 'cifra', role: 'timer', 'aria-live': 'off' });
    nodos.bajoCifra = h('span', { class: 'bajo-cifra' });
    return [
      tarjetaDeImagen(ejercicio),
      h('h2', { class: 'nombre' }, ejercicio.nombre),
      botones.enlace && h('button', { class: 'enlace', onclick: ACCIONES[botones.enlace.id] }, botones.enlace.texto),
      h('p', { class: 'estado' }, textoDeEstado(v)),
      h('p', { class: 'marcador' }, nodos.cifra, nodos.bajoCifra),
      h('p', { class: 'que-toca' }, queToca(entrada), ejercicio.maquina && h('span', { class: 'maquina' }, ` · ${ejercicio.maquina}`)),
      ejercicio.maquina &&
        h(
          'button',
          { class: 'enlace', onclick: editarMisAjustes },
          entrada.misAjustes ? `Mis ajustes: ${entrada.misAjustes}` : 'Mis ajustes: toca para escribirlos',
        ),
      h(
        'div',
        { class: 'detalles' },
        entrada.notas && h('p', { class: 'aviso nota' }, entrada.notas),
        h('ul', { class: 'indicaciones' }, ejercicio.indicaciones.map((texto) => h('li', {}, texto))),
        ejercicio.precaucion && h('p', { class: 'precaucion' }, ejercicio.precaucion),
      ),
    ];
  }

  // Qué hace cada botón del pie. Cuáles salen y en qué orden lo decide `botonera.js`.
  const ACCIONES = {
    salir,
    hecho: () => motor.hecho(),
    pausa: () => (motor.vista().pausado ? motor.reanudar() : motor.pausar()),
    'saltar-espera': () => motor.saltarEspera(),
    anterior: () => motor.anterior(),
    siguiente: () => motor.siguiente(),
    'no-apuntar': () => motor.noApuntar(),
    'me-duele': meDuele,
    alarma,
    cambiar: cambiarEjercicio,
  };
  const CLASES = { 'me-duele': 'boton-peligro' };

  // Si a la imagen le queda menos de esto de alto, no se pinta: no se vería nada.
  const ALTO_MINIMO_DE_IMAGEN = 72;
  function ajustarImagen() {
    const marco = raiz.querySelector('.imagen:not([hidden])');
    if (marco && marco.isConnected && marco.clientHeight < ALTO_MINIMO_DE_IMAGEN) marco.hidden = true;
  }

  // Con icono, el texto no se ve: queda como nombre accesible para la voz del iPhone.
  function boton({ id, texto, icono: dibujo = null, apagado = false }, clase = '') {
    const atributos = { class: `boton ${clase}`.trim(), disabled: apagado, onclick: ACCIONES[id] };
    if (!dibujo) return h('button', atributos, texto);
    return h('button', { ...atributos, 'aria-label': texto, title: texto }, icono(dibujo));
  }

  function pintar() {
    const v = motor.vista();
    if (v.fase !== 'activa') return;
    nodos.cifra = nodos.bajoCifra = nodos.descanso = nodos.bajoDescanso = nodos.marcadorDescanso = null;
    const enRegistro = v.paso.tipo === 'registro';
    const botones = botonera(v);

    poner(
      raiz,
      h(
        'header',
        { class: 'cabecera' },
        boton(botones.cabecera[0], 'boton-plano'),
        h('p', { class: 'progreso' }, textoDeProgreso(v)),
        boton(botones.cabecera[1], 'boton-alarma boton-compacto'),
      ),
      h(
        'div',
        { class: v.pausado ? 'contenido en-pausa' : 'contenido' },
        enRegistro ? contenidoDelRegistro(v) : contenidoDeLaTarjeta(v, botones),
      ),
      h(
        'footer',
        { class: 'pie' },
        botones.principal && boton(botones.principal, 'boton-principal'),
        h(
          'div',
          { class: 'botones' },
          botones.fila.map((b) => boton(b, [CLASES[b.id], b.destacado && 'boton-destacado'].filter(Boolean).join(' '))),
        ),
      ),
    );
    actualizar();
    requestAnimationFrame(ajustarImagen);
  }

  // Lo que cambia varias veces por segundo: la cifra grande y el descanso.
  function actualizar() {
    const v = motor.vista();
    if (v.fase !== 'activa') return;
    const { paso, entrada } = v;

    if (nodos.descanso) {
      const pendiente = v.descansoPendienteSegundos;
      // Tras la última serie no hay descanso: no se pinta el marcador.
      nodos.marcadorDescanso.hidden = pendiente === null;
      if (pendiente !== null) {
        nodos.descanso.textContent = textoDeCuenta(pendiente);
        nodos.bajoDescanso.textContent = pendiente > 0 ? 'de descanso' : 'Descanso terminado';
      }
    }
    if (!nodos.cifra) return;

    let cifra;
    let debajo = '';
    if (paso.tipo === 'trabajo' && paso.modo === 'manual') {
      cifra = String(entrada.repeticiones);
      debajo = entrada.pesoKg ? `repeticiones · ${textoNumero(entrada.pesoKg)} kg` : 'repeticiones';
    } else if (paso.tipo === 'trabajo' && paso.modo === 'fases') {
      cifra = String(v.repeticion.actual);
      debajo = `de ${v.repeticion.total} · ${v.textoDeFase}`;
    } else {
      cifra = textoDeCuenta(v.restanteSegundos);
      if (paso.tipo === 'trabajo') debajo = 'segundos';
      else if (paso.tipo === 'descanso') debajo = 'de descanso';
    }
    if (nodos.cifra.textContent !== cifra) nodos.cifra.textContent = cifra;
    if (nodos.bajoCifra.textContent !== debajo) nodos.bajoCifra.textContent = debajo;
  }

  // ---- Reloj, pantalla encendida y guardado al salir ----

  let tics = 0;
  const reloj = setInterval(() => {
    motor.tic();
    actualizar();
    // Cada pocos segundos se guarda por dónde va, por si la app se cierra de golpe.
    tics += 1;
    if (tics % Math.round(CONFIG.guardarCadaMs / CONFIG.intervaloDeRelojMs) === 0) guardar();
  }, CONFIG.intervaloDeRelojMs);

  // Que la pantalla no se apague durante la sesión (5.4). Solo se puede comprobar bien en el iPhone.
  async function mantenerPantalla() {
    try {
      bloqueoDePantalla = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      bloqueoDePantalla = null;
    }
  }

  function alCambiarVisibilidad() {
    if (document.visibilityState === 'visible') {
      // Al volver, se recalcula con la hora real (sección 9) y se vuelve a pedir la pantalla encendida.
      motor.tic();
      actualizar();
      mantenerPantalla();
    } else {
      guardar();
    }
  }

  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  window.addEventListener('pagehide', guardar);
  mantenerPantalla();

  if (instantanea) pintar();
  else motor.empezar();

  return {
    nodo: raiz,
    alSalir() {
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('pagehide', guardar);
      bloqueoDePantalla?.release?.().catch(() => {});
      cerrar();
    },
  };
}
