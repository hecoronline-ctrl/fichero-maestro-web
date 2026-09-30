/**
 * Genera las fichas Makro de todos los ficheros con el maestro incluido, las guarda
 * en la carpeta indicada y compara cada celda con la ficha ya enviada a Makro.
 * Uso: npx tsx scripts/probar-fichas-makro.ts [carpeta_salida] [filtro]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Libro } from '../src/engine/xlsx';
import { readMaster } from '../src/engine/maestro';
import { FICHEROS_FICHAS, generarFichasMakro } from '../src/engine/makroFichas';
import type { FiltroFichas } from '../src/engine/makroFichas';
import { claveCabeceras } from '../src/config/makroFichas';

const [salida = 'salida-fichas', filtro = 'todos'] = process.argv.slice(2);
mkdirSync(salida, { recursive: true });
const catalogo = readMaster(Libro.abrir(readFileSync('public/datos/FICHERO_MAESTRO2.xlsx')));
const enviadas = JSON.parse(readFileSync('public/datos/makro_fichas.json', 'utf8'));

for (const f of FICHEROS_FICHAS) {
  const plantilla = readFileSync(`public/plantillas/Makro/multi_template ${f}.xlsx`);
  const t0 = Date.now();
  const r = generarFichasMakro(f, plantilla, catalogo, enviadas, filtro as FiltroFichas);
  const bytes = new Uint8Array(await r.blob.arrayBuffer());
  writeFileSync(`${salida}/multi_template_${f}.xlsx`, bytes);
  console.log(`\n=== ${f}: ${r.filas} filas, ${r.avisos.length} avisos, ${r.errores.length} errores (${Date.now() - t0} ms)`);
  r.errores.forEach((e) => console.log('  ERROR', e));
  r.avisos.forEach((a) => console.log('  aviso', a));

  // Diferencias con lo ya enviado, por columna.
  const h = Libro.abrir(bytes).hoja('Products Template');
  const cab = claveCabeceras((c) => h.texto(7, c), h.ultimaColumna);
  const difs = new Map<string, number>();
  for (let row = 8; row <= h.ultimaFila; row++) {
    const g = h.texto(row, cab.get('GTIN')!);
    const ref = enviadas[`${f}|${g}`];
    if (!ref) continue;
    for (const [k, c] of cab) {
      const a = h.texto(row, c);
      const b = ref[k] === undefined ? '' : String(ref[k]).trim();
      if (a !== b) difs.set(k, (difs.get(k) ?? 0) + 1);
    }
    // longitud de nombres
    for (const [k, c] of cab) if (k.startsWith('Product name') && h.texto(row, c).length > 150) console.log('  >150', g, k);
  }
  console.log('  cambios frente a lo enviado:', [...difs].map(([k, n]) => `${k}=${n}`).join(', ') || 'ninguno');
}
