// Formato de números y tiempos. Funciones puras, sin pantalla.

// 20 → «20», 22.5 → «22,5».
export function textoNumero(n) {
  return String(n).replace('.', ',');
}

// 95 → «1:35». Para los tiempos largos.
export function textoReloj(segundos) {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Suma o resta un paso sin bajar de cero y sin decimales raros (0.1 + 0.2).
export function ajustar(valor, paso) {
  return Math.max(0, Math.round((valor + paso) * 100) / 100);
}

// La cifra grande de una cuenta atrás: segundos hasta 99 y, por encima, minutos y segundos (1:40).
export function textoDeCuenta(segundos) {
  return segundos >= 100 ? textoReloj(segundos) : String(Math.max(0, Math.round(segundos)));
}
