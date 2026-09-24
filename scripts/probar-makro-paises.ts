/**
 * Prueba el flujo Makro en todos los paises con unos CSV reales y resume lo que sale.
 *
 *   npx tsx scripts/probar-makro-paises.ts <precios.csv>[,<precios2.csv>...] <stock.csv>
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getMarketplace } from '../src/config/marketplaces';
import { readMaster } from '../src/engine/maestro';
import { generarMakro } from '../src/engine/makro';
import { Libro } from '../src/engine/xlsx';

const PUBLIC = join(resolve(import.meta.dirname, '..'), 'public');
const [precios, stock] = process.argv.slice(2);
if (!stock) {
  console.error('Uso: npx tsx scripts/probar-makro-paises.ts <precios.csv>[,...] <stock.csv>');
  process.exit(1);
}
// varios CSV de precios se juntan en uno (misma cabecera)
const csvPrecio = precios
  .split(',')
  .map((p, i) => {
    const t = readFileSync(p, 'utf8').replace(/^﻿/, '').trimEnd();
    return i === 0 ? t : t.split(/\r?\n/).slice(1).join('\n');
  })
  .join('\n');
const csvStock = readFileSync(stock, 'utf8');
const catalogo = readMaster(
  Libro.abrir(new Uint8Array(readFileSync(join(PUBLIC, 'datos', 'FICHERO_MAESTRO2.xlsx')))),
);

for (const pais of getMarketplace('Makro')!.paises) {
  const plantilla = new Uint8Array(
    readFileSync(join(PUBLIC, 'plantillas', 'Makro', `offer_template ${pais}.xlsx`)),
  );
  const r = generarMakro(pais, plantilla, catalogo, csvPrecio, csvStock);
  if (!r) {
    console.log(`${pais}: sin datos -> no se toca`);
    continue;
  }
  const h = Libro.abrir(r.bytes).hoja('Offers');
  const cab: Record<string, number> = {};
  for (let c = 1; c <= h.ultimaColumna; c++) cab[String(h.get(1, c) ?? '')] = c;
  const combos = new Map<string, number>();
  let filas = 0;
  for (let f = 2; f <= h.ultimaFila; f++) {
    if (!h.texto(f, cab['GTIN'])) continue;
    filas++;
    const k = ['Destination', 'Origin', 'Processing time min', 'Processing time max', 'Shipping Group']
      .map((n) => String(h.get(f, cab[n]) ?? ''))
      .join(' ');
    combos.set(k, (combos.get(k) ?? 0) + 1);
  }
  const ej = 2;
  console.log(
    `${pais}: ${filas} filas, ${r.precios} precios, ${r.stocks} stocks | ` +
      [...combos].map(([k, n]) => `${k} x${n}`).join(' ; ') +
      ` | fila ${ej}: GTIN ${h.texto(ej, cab['GTIN'])} neto ${h.get(ej, cab['Net price'])} stock ${h.get(ej, cab['Quantity'])}`,
  );
}
