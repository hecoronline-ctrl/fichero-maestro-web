/**
 * Makro — port de tools/Generar-Makro.ps1.
 *
 * REGLA DE ORO: la plantilla offer_template {PAIS}.xlsx ES la base y ya trae los
 * precios buenos (netos). Lo que NO aparezca en los CSV subidos NO se toca.
 *   - CSV de PRECIO (con IVA): cambia el precio solo de los productos que trae,
 *     Net price = applied_price / (1 + IVA del pais).
 *   - CSV de STOCK (snapshot): ajusta Quantity solo de los que trae (Madera se ignora).
 * Ademas fuerza el Shipping Group por modelo y recalcula los descuentos por cantidad.
 *
 * Diferencia con la version de escritorio: alli la plantilla base se actualizaba EN
 * SITIO. Aqui no hay disco, asi que la plantilla actualizada se guarda en el navegador
 * (ver store.ts) y esa pasa a ser la base de la siguiente vez.
 */
import { MAKRO_DESCUENTOS, MAKRO_PAIS_CFG, MAKRO_SHIPPING } from '../config/marketplaces';
import { campo, parseCsv } from './csv';
import type { FilaMaestro } from './maestro';
import { blobXlsx, getColIndexByLabel, stamp } from './excel';
import { Libro } from './xlsx';

export type ResultadoMakro = {
  pais: string;
  nombre: string;
  blob: Blob;
  /** Plantilla actualizada, para persistirla como nueva base. */
  bytes: Uint8Array;
  precios: number;
  stocks: number;
};

// ---- helpers de mapeo (mismos criterios que Actualizar-Ofertas) ----
export function modeloDeSku(s: string): string | null {
  const a = /\.(\d{3})(?:_|$)/.exec(s ?? '');
  if (a) return a[1];
  const b = /(\d{3})/.exec(s ?? '');
  return b ? b[1] : null;
}

export function sufijoDeSku(s: string): string {
  const m = /\.\d{3}_(.+)$/.exec(s ?? '');
  return m ? m[1] : '';
}

export function colorDeSufijo(s: string): string | null {
  if (!s || !s.trim()) return 'G';
  switch (s.trim().toUpperCase()) {
    case 'G':
    case 'GR':
      return 'G';
    case 'N':
    case 'NE':
      return 'N';
    case 'B':
    case 'BL':
      return 'B';
    case 'B&N':
    case 'BYN':
    case 'B&W':
    case 'B-N':
      return 'B-N';
    default:
      return null;
  }
}

export function colorDeStock(c: string): string | null {
  switch ((c ?? '').trim().toLowerCase()) {
    case 'gris':
      return 'G';
    case 'negro':
      return 'N';
    case 'blanco':
      return 'B';
    case 'b&n':
    case 'byn':
    case 'b&w':
      return 'B-N';
    default:
      return null; // Madera y desconocidos se ignoran
  }
}

/** "modelo|color" -> EAN, desde el maestro parseando sku_canonico. */
export function buildCatalogoMakro(catalogo: FilaMaestro[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const fila of catalogo) {
    const sku = String(fila['sku_canonico'] ?? '').trim();
    const ean = String(fila['ean'] ?? '').trim();
    if (!sku || !ean) continue;
    const mod = modeloDeSku(sku);
    const col = colorDeSufijo(sufijoDeSku(sku));
    if (mod && col) map.set(`${mod}|${col}`, ean);
  }
  return map;
}

/** CSV de precios -> EAN -> precio bruto (con IVA), filtrado por pais. */
export function leerPrecios(
  csv: string,
  cat: Map<string, string>,
  precioPais: string,
): Map<string, number> {
  const r = new Map<string, number>();
  if (!csv) return r;
  for (const fila of parseCsv(csv)) {
    if (campo(fila, 'country').trim().toUpperCase() !== precioPais.toUpperCase()) continue;
    const sku = campo(fila, 'sku');
    const mod = modeloDeSku(sku);
    const col = colorDeSufijo(sufijoDeSku(sku));
    if (!mod || !col) continue;
    const ean = cat.get(`${mod}|${col}`);
    if (!ean) continue;
    const ap = campo(fila, 'applied_price').trim().replace(',', '.');
    if (ap !== '') r.set(ean, Number(ap));
  }
  return r;
}

/** CSV de stock -> EAN -> unidades, filtrado por pais. */
export function leerStock(
  csv: string,
  cat: Map<string, string>,
  stockPais: string,
): Map<string, number> {
  const r = new Map<string, number>();
  if (!csv) return r;
  for (const fila of parseCsv(csv)) {
    if (campo(fila, 'Pais', 'País').trim().toUpperCase() !== stockPais.toUpperCase()) continue;
    const col = colorDeStock(campo(fila, 'Color'));
    if (!col) continue; // Madera -> se ignora
    const mod = modeloDeSku(campo(fila, 'Producto')) ?? modeloDeSku(campo(fila, 'SKU'));
    if (!mod) continue;
    const ean = cat.get(`${mod}|${col}`);
    if (!ean) continue;
    const n = parseInt(campo(fila, 'Stock').trim(), 10);
    if (!Number.isNaN(n)) r.set(ean, n);
  }
  return r;
}

/** Aplica precio y stock a la plantilla de un pais. null si no hay datos para el. */
export function generarMakro(
  pais: string,
  plantilla: ArrayBuffer | Uint8Array,
  catalogo: FilaMaestro[],
  csvPrecio: string,
  csvStock: string,
): ResultadoMakro | null {
  const cfg = MAKRO_PAIS_CFG[pais];
  if (!cfg) throw new Error(`Pais Makro desconocido: ${pais}`);

  const cat = buildCatalogoMakro(catalogo);
  const precios = leerPrecios(csvPrecio, cat, cfg.precioPais);
  const stock = leerStock(csvStock, cat, cfg.stockPais);
  // Lo que no viene en ningun archivo, no se toca.
  if (precios.size === 0 && stock.size === 0) return null;

  const libro = Libro.abrir(plantilla);
  if (!libro.tieneHoja('Offers')) {
    throw new Error("La plantilla de Makro no tiene la hoja 'Offers'.");
  }
  const hoja = libro.hoja('Offers');

  const nCols = Math.max(hoja.ultimaColumna, 60);
  const col = (etiqueta: string) => getColIndexByLabel(hoja, 1, nCols, etiqueta);
  const cGtin = col('GTIN');
  const cQty = col('Quantity');
  const cNet = col('Net price');
  const cShip = col('Shipping Group');
  if (!cGtin || !cNet) {
    throw new Error('La plantilla de Makro no tiene las columnas GTIN / Net price.');
  }

  // EAN -> modelo, para forzar el Shipping Group correcto por norma.
  const eanModelo = new Map<string, string>();
  for (const [k, ean] of cat) eanModelo.set(ean, k.split('|')[0]);

  const descuentos = MAKRO_DESCUENTOS.map((d) => ({ col: col(d.etiqueta), f: d.f }));

  let nP = 0;
  let nS = 0;
  const nRows = hoja.ultimaFila;
  for (let r = 2; r <= nRows; r++) {
    const g = hoja.texto(r, cGtin);
    if (!g) continue;

    if (precios.has(g)) {
      hoja.set(r, cNet, redondear(precios.get(g)! / cfg.vat, 2));
      nP++;
    }
    if (stock.has(g) && cQty) {
      hoja.set(r, cQty, stock.get(g)!);
      nS++;
    }
    if (cShip) {
      const m = eanModelo.get(g);
      if (m && MAKRO_SHIPPING[m]) hoja.set(r, cShip, MAKRO_SHIPPING[m]);
    }
    // descuentos por cantidad sobre el neto ACTUAL (todos los productos)
    const net = hoja.get(r, cNet);
    if (net !== null && String(net) !== '') {
      const n = Number(net);
      if (!Number.isNaN(n)) {
        for (const d of descuentos) {
          if (d.col) hoja.set(r, d.col, redondear(n * d.f, 2));
        }
      }
    }
  }

  // Se escribe UNA vez: los mismos bytes sirven para descargar y para persistir
  // la plantilla actualizada como nueva base.
  const bytes = libro.guardar();
  return {
    pais,
    nombre: `Makro_${pais}_ofertas_${stamp()}.xlsx`,
    blob: blobXlsx(bytes),
    bytes,
    precios: nP,
    stocks: nS,
  };
}

function redondear(n: number, dec: number): number {
  const f = Math.pow(10, dec);
  return Math.round(n * f) / f;
}
