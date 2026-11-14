const admin = require('firebase-admin');

/**
 * Firebase Admin.
 *
 * El Admin SDK ignora las reglas de Firestore, así que es el único lugar
 * donde se pueden escribir los campos sensibles (estadoPago, monto pagado,
 * activación del plan) sin confiar en el navegador.
 *
 * La credencial se toma de GOOGLE_APPLICATION_CREDENTIALS o de la ruta
 * indicada en FIREBASE_CREDENTIALS. Nunca se escribe en el código.
 */

function inicializar() {
  if (admin.apps.length) return admin.app();

  const ruta = process.env.FIREBASE_CREDENTIALS;

  if (ruta) {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const credencial = require(require('path').resolve(ruta));
    return admin.initializeApp({
      credential: admin.credential.cert(credencial),
    });
  }

  // Sin ruta explícita se usa GOOGLE_APPLICATION_CREDENTIALS del entorno.
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

inicializar();

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
