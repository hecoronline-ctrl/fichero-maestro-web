/**
 * Comprueba que los CSV quincenales de stock y precio cruzan con la hoja Ofertas
 * del maestro y deja ver, fila a fila, lo que cambia.
 *
 *   npx tsx scripts/probar-ofertas.ts <maestro.xlsx> <stock.csv> <precios.csv> [Marketplace]
 *
 * No se compara contra el motor de PowerShell como en validar.ts: el script de
 * escritorio dejo de cruzar el stock cuando el CSV cambio de formato (Producto y
 * SKU intercambiados), asi que su salida ya no sirve de referencia. Aqui se
 * comprueba contra el propio CSV, que es la fuente de verdad.
 */
import { readFileSync } from 'node:fs';
import { aplicarPreciosYStock, cargarPrecios, cargarStock } from '../src/engine/ofertas';
import { readMaestro } from '../src/engine/maestro';

const [maestroPath, stockPath, preciosPath, portal = 'LeroyMerlin'] = process.argv.slice(2);
if (!maestroPath || !stockPath || !preciosPath) {
  console.error('Uso: npx tsx scripts/probar-ofertas.ts <maestro.xlsx> <stock.csv> <precios.csv> [Marketplace]');
  process.exit(2);
}

const bytes = readFileSync(maestroPath);
const csvStock = readFileSync(stockPath, 'utf8');
const csvPrecios = readFileSync(preciosPath, 'utf8');

const stock = cargarStock(csvStock);
const precios = cargarPrecios(csvPrecios);
console.log(`CSV de stock:   ${stock.leidas} lineas utiles, ${stock.ignoradas} ignoradas.`);
console.log(`CSV de precios: ${precios.leidas} cambios utiles, ${precios.ignoradas} ignorados.`);

const antes = readMaestro(bytes).ofertas.filter((o) => String(o['Marketplace']) === portal);
const r = aplicarPreciosYStock(bytes, csvStock, csvPrecios);
const despues = readMaestro(r.bytes).ofertas.filter((o) => String(o['Marketplace']) === portal);

console.log(`\nAplicado: ${r.precios} precios y ${r.stocks} stocks. ${r.sinTocar} filas DE/UK sin tocar.`);
for (const a of r.avisos) console.log(`  aviso: ${a}`);

console.log(`\n${portal} — ${antes.length} filas:`);
let cambios = 0;
for (let i = 0; i < antes.length; i++) {
  const a = antes[i];
  const d = despues[i];
  const pCambia = String(a['Precio']) !== String(d['Precio']);
  const sCambia = String(a['Stock']) !== String(d['Stock']);
  if (pCambia || sCambia) cambios++;
  const marca = pCambia || sCambia ? '*' : ' ';
  const p = pCambia ? `${a['Precio']} -> ${d['Precio']}` : `${d['Precio']}`;
  const s = sCambia ? `${a['Stock']} -> ${d['Stock']}` : `${d['Stock']}`;
  console.log(`${marca} ${String(a['ref']).padEnd(16)} precio ${String(p).padEnd(18)} stock ${s}`);
}
console.log(`\n${cambios} de ${antes.length} filas cambian.`);

if (r.stocks === 0) {
  console.error('\nERROR: el stock no ha cruzado con ninguna fila.');
  process.exit(1);
}
