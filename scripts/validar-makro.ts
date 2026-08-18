/**
 * Valida el flujo Makro del motor web contra la salida de Generar-Makro.ps1.
 *
 *   npx tsx scripts/validar-makro.ts <ref.xlsx> <PAIS> <precios.csv> <stock.csv>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readMaster } from '../src/engine/maestro';
import { generarMakro } from '../src/engine/makro';
import { Libro } from '../src/engine/xlsx';

const RAIZ = resolve(import.meta.dirname, '..');
const PUBLIC = join(RAIZ, 'public');
const [ref, pais, csvPrecio, csvStock] = process.argv.slice(2);
if (!ref || !pais) {
  console.error('Uso: npx tsx scripts/validar-makro.ts <ref.xlsx> <PAIS> <precios.csv> <stock.csv>');
  process.exit(1);
}

const bytes = (p: string) => new Uint8Array(readFileSync(p));
const texto = (p?: string) => (p ? readFileSync(p, 'utf8') : '');

function norm(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6);
  const s = String(v).trim();
  if (s !== '' && !Number.isNaN(Number(s))) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.round(n * 1e6) / 1e6);
  }
  return s;
}

const catalogo = readMaster(Libro.abrir(bytes(join(PUBLIC, 'datos', 'FICHERO_MAESTRO2.xlsx'))));
const plantilla = bytes(join(PUBLIC, 'plantillas', 'Makro', `offer_template ${pais}.xlsx`));

const t0 = Date.now();
const res = generarMakro(pais, plantilla, catalogo, texto(csvPrecio), texto(csvStock));
if (!res) {
  console.log('El motor web no encontro datos para ese pais (no habria tocado nada).');
  process.exit(1);
}
console.log(
  `Web: ${res.precios} precios y ${res.stocks} stocks actualizados (en ${Date.now() - t0} ms)\n`,
);

const salida = join(RAIZ, '.validacion');
mkdirSync(salida, { recursive: true });
writeFileSync(join(salida, res.nombre), res.bytes);

const hojaPS = Libro.abrir(bytes(ref)).hoja('Offers');
const hojaWeb = Libro.abrir(res.bytes).hoja('Offers');
const filas = Math.max(hojaPS.ultimaFila, hojaWeb.ultimaFila);
const cols = Math.max(hojaPS.ultimaColumna, hojaWeb.ultimaColumna);

const difs: string[] = [];
for (let r = 1; r <= filas; r++) {
  for (let c = 1; c <= cols; c++) {
    const a = norm(hojaPS.get(r, c));
    const b = norm(hojaWeb.get(r, c));
    if (a !== b) {
      const cab = String(hojaPS.get(1, c) ?? `col ${c}`);
      difs.push(`  fila ${r} "${cab}": PS=${JSON.stringify(a)} | web=${JSON.stringify(b)}`);
    }
  }
}

console.log(
  `[${difs.length === 0 ? 'OK ' : 'DIF'}] Makro ${pais}: ${filas * cols} celdas comparadas, ${difs.length} diferencias`,
);
for (const d of difs.slice(0, 25)) console.log(d);
if (difs.length > 25) console.log(`  ... y ${difs.length - 25} mas`);
process.exit(difs.length === 0 ? 0 : 1);
