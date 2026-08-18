/**
 * Valida el motor web contra los ficheros generados por el motor PowerShell.
 * Compara celda a celda la hoja de datos y reporta cualquier diferencia.
 *
 *   npx tsx scripts/validar.ts <carpeta-con-referencias>
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getMarketplace } from '../src/config/marketplaces';
import { readMaster, readOfertas } from '../src/engine/maestro';
import { generarConPlantilla, rutaPlantilla } from '../src/engine/generar';
import { Libro } from '../src/engine/xlsx';

const RAIZ = resolve(import.meta.dirname, '..');
const PUBLIC = join(RAIZ, 'public');
const refDir = process.argv[2];
if (!refDir) {
  console.error('Uso: npx tsx scripts/validar.ts <carpeta-referencias>');
  process.exit(1);
}
const salida = join(RAIZ, '.validacion');
mkdirSync(salida, { recursive: true });

const bytes = (p: string) => new Uint8Array(readFileSync(p));

/** Normaliza para comparar: numero y "numero como texto" deben coincidir. */
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

const t0 = Date.now();
const libroM = Libro.abrir(bytes(join(PUBLIC, 'datos', 'FICHERO_MAESTRO2.xlsx')));
const maestro = { catalogo: readMaster(libroM), ofertas: readOfertas(libroM) };
console.log(
  `Maestro leido en ${Date.now() - t0} ms: ${maestro.catalogo.length} productos, ${maestro.ofertas.length} ofertas\n`,
);

const casos: { mp: string; tipo: 'catalogo' | 'ofertas'; pais: string; ref: string }[] = [];
for (const f of readdirSync(refDir).filter((x) => x.endsWith('.xlsx'))) {
  const m = /^(\w+)_(\w+)_(catalogo|ofertas)_/.exec(f);
  if (m) casos.push({ mp: m[1], pais: m[2], tipo: m[3] as 'catalogo' | 'ofertas', ref: f });
}

let totalDif = 0;
for (const caso of casos) {
  const mp = getMarketplace(caso.mp);
  if (!mp) {
    console.log(`  ? ${caso.ref}: marketplace ${caso.mp} no esta en el config`);
    continue;
  }
  const cfg = mp[caso.tipo]!;
  const tGen = Date.now();
  const plantilla = bytes(join(PUBLIC, 'plantillas', rutaPlantilla(mp, caso.tipo, caso.pais)));
  const res = generarConPlantilla(mp, caso.tipo, caso.pais, maestro, plantilla);
  const ms = Date.now() - tGen;
  writeFileSync(join(salida, res.nombre), res.bytes);

  const hojaPS = Libro.abrir(bytes(join(refDir, caso.ref))).hoja(cfg.hoja);
  const hojaWeb = Libro.abrir(res.bytes).hoja(cfg.hoja);

  const filas = Math.max(hojaPS.ultimaFila, hojaWeb.ultimaFila);
  const cols = Math.max(hojaPS.ultimaColumna, hojaWeb.ultimaColumna);
  const difs: string[] = [];
  for (let r = 1; r <= filas; r++) {
    for (let c = 1; c <= cols; c++) {
      const a = norm(hojaPS.get(r, c));
      const b = norm(hojaWeb.get(r, c));
      if (a !== b) {
        difs.push(
          `    fila ${r} col ${c}: PS=${JSON.stringify(a).slice(0, 70)} | web=${JSON.stringify(b).slice(0, 70)}`,
        );
      }
    }
  }
  totalDif += difs.length;
  console.log(
    `[${difs.length === 0 ? 'OK ' : 'DIF'}] ${mp.id} ${caso.pais} ${caso.tipo}: ${res.filas} filas, ` +
      `${filas * cols} celdas comparadas, ${difs.length} diferencias  (generado en ${ms} ms)`,
  );
  for (const d of difs.slice(0, 12)) console.log(d);
  if (difs.length > 12) console.log(`    ... y ${difs.length - 12} mas`);
  for (const a of res.avisos) console.log(`    aviso: ${a}`);
}

console.log(`\n${casos.length} casos, ${totalDif} diferencias en total.`);
console.log(`Salidas del motor web en: ${salida}`);
process.exit(totalDif === 0 ? 0 : 1);
