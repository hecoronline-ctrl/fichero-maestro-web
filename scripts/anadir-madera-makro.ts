/**
 * Mete las taquillas efecto madera (_M) y antracita (_A) en las plantillas de oferta de
 * Makro de la web. Uso: npx tsx scripts/anadir-madera-makro.ts
 *
 * Precio: el de Espana del maestro (fila LeroyMerlin/ALL) sin el IVA de cada pais, igual
 * que los bancos. Stock 0. Destino, almacen, plazo, Shipping Group y descuentos por
 * cantidad con las mismas reglas que aplica la web al generar (config/marketplaces.ts).
 * Solo anade los GTIN que falten; lo que ya esta en la plantilla no se toca.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  MAKRO_DESCUENTOS,
  MAKRO_ORIGENES,
  MAKRO_PAIS_CFG,
  MAKRO_SHIPPING,
} from '../src/config/marketplaces';
import { readMaestro } from '../src/engine/maestro';
import { Libro } from '../src/engine/xlsx';

const maestro = readMaestro(readFileSync('public/datos/FICHERO_MAESTRO2.xlsx'));
const precioES = new Map<string, number>();
for (const o of maestro.ofertas) {
  if (o['Marketplace'] === 'LeroyMerlin' && o['Pais'] === 'ALL') {
    precioES.set(String(o['EAN']).trim(), Number(o['Precio']));
  }
}
const productos = maestro.catalogo.filter((f) => /_(M|A)$/.test(String(f['sku_canonico'] ?? '')));
if (productos.length !== 10) throw new Error(`Se esperaban 10 productos M/A y hay ${productos.length}`);

const r2 = (n: number) => Math.round(n * 100) / 100;

for (const pais of ['ES', 'PT', 'IT', 'FR', 'DE', 'NL']) {
  const ruta = `public/plantillas/Makro/offer_template ${pais}.xlsx`;
  const libro = Libro.abrir(readFileSync(ruta));
  const hoja = libro.hoja('Offers');
  const col = new Map<string, number>();
  for (let c = 1; c <= Math.max(hoja.ultimaColumna, 30); c++) {
    const t = hoja.texto(1, c);
    if (t && !col.has(t)) col.set(t, c);
  }
  const C = (h: string) => {
    const c = col.get(h);
    if (!c) throw new Error(`${pais}: falta la columna '${h}'`);
    return c;
  };

  const tiene = new Set<string>();
  let ultima = 1;
  for (let r = 2; r <= hoja.ultimaFila; r++) {
    const g = hoja.texto(r, C('GTIN'));
    if (g) {
      tiene.add(g);
      ultima = r;
    }
  }
  const estilos = hoja.estilosDeFila(2);
  const cfg = MAKRO_PAIS_CFG[pais];
  const origen = MAKRO_ORIGENES[cfg.origen];

  const hechas: string[] = [];
  for (const f of productos) {
    const ean = String(f['ean']).trim();
    if (tiene.has(ean)) continue;
    const bruto = precioES.get(ean);
    if (bruto === undefined) throw new Error(`Sin precio de Espana para ${f['sku_canonico']}`);
    const neto = r2(bruto / cfg.vat);
    const modelo = String(f['modelo']).padStart(3, '0');
    const r = ++ultima;
    hoja.set(r, C('GTIN'), ean, estilos);
    hoja.set(r, C('Manufacturer'), 'TwinThink', estilos);
    hoja.set(r, C('Quantity'), 0, estilos);
    hoja.set(r, C('Net price'), neto, estilos);
    hoja.set(r, C('Processing time min'), origen.min, estilos);
    hoja.set(r, C('Processing time max'), origen.max, estilos);
    hoja.set(r, C('Destination'), `${pais}_MAIN`, estilos);
    hoja.set(r, C('Origin'), origen.origin, estilos);
    for (const d of MAKRO_DESCUENTOS) hoja.set(r, C(d.etiqueta), r2(neto * d.f), estilos);
    hoja.set(r, C('Shipping Group'), MAKRO_SHIPPING[modelo], estilos);
    hechas.push(`${f['sku_canonico']} ${neto}`);
  }
  writeFileSync(ruta, libro.guardar());
  console.log(`${pais}: ${hechas.length} filas nuevas | ${hechas.join(', ')}`);
}
