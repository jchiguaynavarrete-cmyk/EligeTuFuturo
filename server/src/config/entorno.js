/**
 * Lectura de variables de entorno a prueba de copiar y pegar.
 *
 * Al pegar un valor en el panel de Render es fácil arrastrar un espacio
 * o un salto de línea invisible. Un salto al final de `FRONTEND_URL`
 * basta para que el navegador rechace el regreso desde Webpay con
 * ERR_INVALID_REDIRECT, y el error no dice nada sobre su causa.
 *
 * Aquí se limpian todos los espacios de los extremos, incluidos saltos
 * de línea y tabulaciones, y se descartan las comillas que a veces
 * quedan al copiar un valor desde un archivo .env.
 */
function leer(nombre, porDefecto = undefined) {
  const bruto = process.env[nombre];
  if (bruto === undefined || bruto === null) return porDefecto;

  let valor = String(bruto).trim();

  // Comillas que envolvían el valor completo.
  if (valor.length >= 2) {
    const a = valor[0];
    const z = valor[valor.length - 1];
    if ((a === '"' && z === '"') || (a === "'" && z === "'")) {
      valor = valor.slice(1, -1).trim();
    }
  }

  return valor === '' ? porDefecto : valor;
}

/** Igual que `leer`, pero además quita la barra final de una URL. */
function leerUrl(nombre, porDefecto = undefined) {
  const valor = leer(nombre, porDefecto);
  return typeof valor === 'string' ? valor.replace(/\/+$/, '') : valor;
}

module.exports = { leer, leerUrl };
