// Ayudas mínimas para montar la pantalla sin escribir HTML a mano dentro del código.
// El texto siempre entra como texto (no como HTML): así lo que venga de un archivo importado
// no puede colar nada raro en la página.

// h('button', { class: 'boton', onclick: f }, 'Empezar') → <button class="boton">Empezar</button>
export function h(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [nombre, valor] of Object.entries(atributos ?? {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (nombre.startsWith('on') && typeof valor === 'function') {
      nodo.addEventListener(nombre.slice(2), valor);
    } else if (nombre === 'class') {
      nodo.className = valor;
    } else if (nombre in nodo && !nombre.startsWith('aria-') && nombre !== 'list') {
      nodo[nombre] = valor;
    } else {
      nodo.setAttribute(nombre, valor === true ? '' : valor);
    }
  }
  anadir(nodo, hijos);
  return nodo;
}

function anadir(nodo, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}

// Cambia todo el contenido de un nodo.
export function poner(nodo, ...hijos) {
  nodo.replaceChildren();
  anadir(nodo, hijos);
  return nodo;
}

// Una pantalla estándar: cabecera, contenido que se desplaza y pie fijo.
export function pantalla({ clase = '', cabecera = [], contenido = [], pie = [] }) {
  return h(
    'div',
    { class: `pantalla ${clase}`.trim() },
    h('header', { class: 'cabecera' }, cabecera),
    h('div', { class: 'contenido' }, contenido),
    h('footer', { class: 'pie' }, pie),
  );
}

// Un panel que sale desde abajo, por encima de la pantalla. Devuelve una función para cerrarlo.
export function abrirHoja(...hijos) {
  const velo = h('div', { class: 'velo', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'hoja' }, hijos));
  document.body.append(velo);
  velo.querySelector('button, input, textarea')?.focus({ preventScroll: true });
  return () => velo.remove();
}

// Iconos de los botones del reproductor, dibujados aquí mismo (sin archivos ni fuentes externas).
const ICONOS = {
  anterior: 'M5 5h2.5v14H5zM20 5v14L9 12z',
  siguiente: 'M16.5 5H19v14h-2.5zM4 5v14l11-7z',
  pausa: 'M6.5 5h4v14h-4zM13.5 5h4v14h-4z',
  seguir: 'M7.5 4.5v15l12-7.5z',
};

export function icono(nombre) {
  // Esto es el nombre del formato SVG, no una dirección que la app visite.
  const ESPACIO = 'http://www.w3.org/2000/svg';
  const dibujo = document.createElementNS(ESPACIO, 'svg');
  dibujo.setAttribute('viewBox', '0 0 24 24');
  dibujo.setAttribute('width', '30');
  dibujo.setAttribute('height', '30');
  dibujo.setAttribute('aria-hidden', 'true');
  dibujo.setAttribute('focusable', 'false');
  const trazo = document.createElementNS(ESPACIO, 'path');
  trazo.setAttribute('d', ICONOS[nombre]);
  trazo.setAttribute('fill', 'currentColor');
  dibujo.append(trazo);
  return dibujo;
}
