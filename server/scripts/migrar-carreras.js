/**
 * Migra carreras desde el JSON del scraping a Supabase.
 *
 * Se usa el archivo original en vez de leer Firestore: la cuota diaria de
 * Firestore se agota con unas pocas consultas al catálogo completo, y el
 * JSON tiene exactamente los mismos datos.
 *
 * Uso:
 *   node scripts/migrar-carreras.js [cantidad]
 *
 * Sin argumento migra 3.000, que es lo acordado para no llenar la base.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { db } = require('../src/config/supabase');

const ORIGEN = path.resolve(__dirname, '../../../Elige-Tu-Futuro/scrap/todas_fichas_ajax.json');
const CANTIDAD = Number(process.argv[2]) || 3000;
const TAMANO_LOTE = 500;

/** Columnas de la tabla. Lo que no esté aquí se descarta. */
const COLUMNAS = [
  'codigo_carrera', 'carrera', 'nombre_institucion', 'region_sede', 'sede',
  'area_cineunesco', 'horario', 'es_tecnico', 'duracion_formal',
  'vacantes_primer_semestre', 'valor_arancel',
  'notas_em', 'psu_lenguaje', 'psu_matematicas', 'psu_historia',
  'psu_ciencias', 'ranking',
  'costo_titulacion', 'total_femenino_matriculados', 'total_masculino_matriculados',
  'total_matriculados', 'matriculados_femeninos_primer_anyo',
  'matriculados_masculinos_primer_anyo', 'total_matriculados_primer_anyo',
  'municipal', 'particular_subvencionado', 'particular_pagado',
  'total_femenino', 'total_masculino', 'total_titulados', 'otros',
  'promedio_nem', 'promedio_psu_1er_anyo', 'cobertura_psu_1er_anyo', 'matematicas2',
];

/** Todo se guarda como texto, tal como viene del scraping. */
function aTexto(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v).trim();
  return s === '' ? null : s;
}

function aFila(origen) {
  const fila = { activa: true };
  for (const col of COLUMNAS) fila[col] = aTexto(origen[col]);

  // `carrera` es obligatoria en la tabla.
  if (!fila.carrera) fila.carrera = fila.codigo_carrera || 'Sin nombre';
  return fila;
}

(async () => {
  if (!fs.existsSync(ORIGEN)) {
    console.error('No se encontró el archivo de origen:');
    console.error('  ' + ORIGEN);
    process.exit(1);
  }

  console.log('Leyendo el archivo de carreras...');
  const bruto = JSON.parse(fs.readFileSync(ORIGEN, 'utf8'));
  const todas = Array.isArray(bruto) ? bruto : Object.values(bruto);

  console.log(`  disponibles : ${todas.length}`);
  console.log(`  a migrar    : ${CANTIDAD}`);

  const { count: yaHay } = await db
    .from('carreras')
    .select('*', { count: 'exact', head: true });

  // Con --rehacer se vacía la tabla antes de cargar.
  const rehacer = process.argv.includes('--rehacer');

  if (yaHay && yaHay > 0) {
    if (!rehacer) {
      console.log('');
      console.log(`La tabla ya tiene ${yaHay} carreras. No se duplica nada.`);
      console.log('Para rehacer la carga: node scripts/migrar-carreras.js 3000 --rehacer');
      process.exit(0);
    }

    console.log('');
    console.log(`Vaciando las ${yaHay} carreras actuales...`);
    const { error } = await db.from('carreras').delete().gt('id', 0);
    if (error) {
      console.error('No se pudo vaciar:', error.message);
      process.exit(1);
    }
  }

  /**
   * Muestra repartida a lo largo de TODO el archivo.
   *
   * El archivo viene ordenado alfabéticamente, así que tomar las primeras
   * N dejaría fuera medio abecedario. Tampoco sirve saltar de a un paso
   * entero: con 8.815 registros y 3.000 deseados el paso sería 2, y al
   * completar los 3.000 solo se habrían recorrido los primeros 6.000.
   *
   * Calculando el índice como proporción se cubre el archivo entero,
   * de la primera carrera a la última.
   */
  const seleccion = [];
  for (let i = 0; i < CANTIDAD; i++) {
    const indice = Math.floor((i * todas.length) / CANTIDAD);
    seleccion.push(aFila(todas[indice]));
  }

  console.log(`  muestra     : ${CANTIDAD} repartidas entre ${todas.length}`);

  let insertadas = 0;
  for (let i = 0; i < seleccion.length; i += TAMANO_LOTE) {
    const lote = seleccion.slice(i, i + TAMANO_LOTE);
    const { error } = await db.from('carreras').insert(lote);

    if (error) {
      console.error(`\nFalló el lote que empieza en ${i}: ${error.message}`);
      process.exit(1);
    }

    insertadas += lote.length;
    process.stdout.write(`\r  insertadas  : ${insertadas} / ${seleccion.length}`);
  }

  const { count } = await db
    .from('carreras')
    .select('*', { count: 'exact', head: true });

  console.log('');
  console.log('');
  console.log(`Listo. La tabla tiene ${count} carreras.`);
})().catch((e) => {
  console.error('\nERROR:', e.message);
  process.exit(1);
});
