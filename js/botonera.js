// Qué botones lleva el pie del reproductor en cada momento, y en qué orden.
// Es una función pura para poder comprobar con pruebas que los botones no cambian de sitio.
//
// Cada botón: { id, texto, icono, apagado, destacado }. Si lleva `icono`, en pantalla se ve
// el icono y `texto` es su nombre accesible (el que lee la voz del iPhone).
//   cabecera:  arriba del todo: salir y «No me encuentro bien», lejos de los demás.
//   principal: el botón grande de la acción del momento, o null si no hay ninguna.
//   fila:      la única fila de abajo: «Anterior», «Pausa», «Siguiente» y «Me duele».
//   enlace:    «Cambiar ejercicio», bajo el nombre; null si no hay alternativas.
//   registro:  «No apuntar», solo mientras se apunta una serie.

// Texto del botón grande cuando hay una espera que se puede saltar.
const SALTAR = { preparacion: 'Empezar ya', 'cambio-lado': 'Empezar ya', descanso: 'Saltar descanso' };

export function botonera(vista) {
  const { paso, pausado } = vista;
  const esperaHecho = paso.tipo === 'trabajo' && paso.modo === 'manual';

  // El botón grande es la acción del momento. Solo existe cuando hay algo que hacer:
  // terminar una serie a mi ritmo o saltar una espera. En pausa no desaparece: se apaga.
  let principal = null;
  if (esperaHecho) principal = { id: 'hecho', texto: 'Hecho', apagado: pausado };
  else if (SALTAR[paso.tipo]) principal = { id: 'saltar-espera', texto: SALTAR[paso.tipo], apagado: pausado };

  return {
    // «No me encuentro bien» va arriba, separado de «Me duele» y con otro tamaño,
    // para no pulsar uno queriendo pulsar el otro.
    cabecera: [
      { id: 'salir', texto: 'Salir' },
      { id: 'alarma', texto: 'No me encuentro bien' },
    ],
    principal,
    // Siempre los mismos cuatro, en el mismo sitio, y cada uno hace siempre lo mismo:
    // «Anterior» vuelve al ejercicio anterior y «Siguiente» pasa al siguiente.
    // «Pausa» y «Seguir» son el mismo botón.
    fila: [
      { id: 'anterior', texto: 'Anterior', icono: 'anterior' },
      { id: 'pausa', texto: pausado ? 'Seguir' : 'Pausa', icono: pausado ? 'seguir' : 'pausa', destacado: pausado },
      { id: 'siguiente', texto: 'Siguiente', icono: 'siguiente' },
      { id: 'me-duele', texto: 'Me duele', icono: null },
    ],
    // Con un registro abierto no se cambia de ejercicio: `puedeCambiar` ya lo tiene en cuenta.
    enlace: vista.puedeCambiar ? { id: 'cambiar', texto: 'Cambiar ejercicio' } : null,
    // Solo mientras se apunta una serie.
    registro: paso.tipo === 'registro' ? { id: 'no-apuntar', texto: 'No apuntar' } : null,
  };
}

// Los `id` de todos los botones, fila a fila: la «forma» del pie.
export function formaDeLaBotonera(b) {
  return {
    cabecera: b.cabecera.map((boton) => boton.id),
    principal: b.principal?.id ?? null,
    fila: b.fila.map((boton) => boton.id),
    registro: b.registro?.id ?? null,
  };
}
