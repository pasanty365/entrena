// Valores del reproductor, todos juntos para poder cambiarlos sin tocar el resto del código.
// Los tiempos de preparación y de cambio de lado no están aquí: vienen en `ajustes`,
// dentro de `ejercicios.json`.
// Los valores de seguridad de la sección 7 de INSTRUCCIONES.md llegan en la fase 3;
// aquí solo está el texto del aviso de alarma, que la fase 1 ya muestra.

export const CONFIG = Object.freeze({
  // Descanso entre series cuando la sesión no lo indica y hay más de una serie (5.4).
  descansoPorDefectoSegundos: 60,

  // En los ejercicios de tipo `series` (pesas y máquinas) no hay cuenta atrás:
  // para calcular la duración se cuentan estos segundos por repetición (4.4).
  segundosPorRepeticionEnSeries: 4,

  // Pasos de los botones «−» y «+» del registro de series (5.4).
  pasoRepeticiones: 1,
  pasoSegundos: 5,
  pasoPesoKg: 2.5,

  // Pitidos suaves en los últimos segundos de cada cuenta atrás (5.4).
  segundosDePitidos: 3,

  // Cómo suena cada pitido: tono en hercios, duración en milisegundos y volumen de 0 a 1.
  pitidoHz: 880,
  pitidoMs: 220,
  pitidoVolumen: 0.35,

  // Si en Ajustes hay elegida una voz concreta y el dispositivo aún no ha entregado su lista de
  // voces, la app espera como mucho esto antes de decir la primera frase (milisegundos).
  esperaMaximaDeVocesMs: 1500,

  // En los descansos, la voz avisa cuando quedan estos segundos («Quedan 10 segundos»)…
  avisoQuedanSegundos: 10,
  // …pero solo si el descanso dura al menos esto; en uno más corto no hace falta.
  avisoQuedanMinimoSegundos: 20,

  // Margen que queda al acabar una serie de fuerza con repeticiones (5.4).
  // Equivale a 0, 1–2 o 3 o más repeticiones en reserva.
  margenes: Object.freeze(['Nada', 'Poco', 'Bastante']),

  // Material con el que tiene sentido apuntar un peso en el registro de la serie.
  // Son valores de `equipo` del vocabulario de `ejercicios.json`.
  equiposConPeso: Object.freeze(['maquina', 'mancuernas', 'pesa-rusa']),

  // Cada cuánto mira el reloj el reproductor, en milisegundos. No afecta a la precisión:
  // los tiempos se calculan con la hora de fin de cada paso, no sumando intervalos (sección 9).
  intervaloDeRelojMs: 200,

  // Cada cuánto se guarda por dónde va la sesión, para «Seguir donde lo dejaste».
  guardarCadaMs: 5000,

  // Si al terminar un paso el retraso es menor que esto, el siguiente empieza a la hora
  // teórica (así no se acumula desfase). Si es mayor (la app estuvo en segundo plano),
  // el siguiente empieza en el momento de volver.
  retrasoMaximoSinReajusteMs: 1000,

  // Ancho máximo de las imágenes al importarlas, en píxeles (5.7).
  anchoMaximoDeImagenPx: 1200,

  // Duración máxima de una grabación de «pulsar para hablar», en segundos (6.1).
  maximoDeGrabacionSegundos: 60,

  // Voz de la app (sección 3).
  idiomaDeVoz: 'es-ES',

  // Texto que se muestra al pulsar «No me encuentro bien» (7.3). No cambiarlo sin preguntar.
  avisoDeAlarma:
    'Para ahora y descansa. Si el síntoma es intenso, no se pasa o te asusta, llama al 112.',

  // Aviso de la primera vez y de Ajustes (7.5). No cambiarlo sin preguntar.
  avisoInicial:
    'Entrena es una ayuda para entrenar y no sustituye a un profesional sanitario. ' +
    'Si algo te duele, para. Antes de empezar, consulta con tu fisioterapeuta o médico, ' +
    'sobre todo si tienes lesiones o alguna enfermedad.',
});
