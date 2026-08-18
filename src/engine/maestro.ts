/**
 * Lectura del FICHERO_MAESTRO2.xlsx — port de Read-Master / Read-Ofertas.
 *
 * Hoja MAESTRO: 2 filas de cabecera. La fila 1 solo trae el encabezado de PAIS
 * (fusionado) del bloque de imagenes -> se arrastra hacia la derecha para construir
 * claves unicas img_<pais>_<n>, porque "Image 1..6" se repite en cada bloque de pais.
 * La fila 2 son los nombres de campo. Datos desde la fila 3.
 */
import { getCountryCode } from './excel';
import { Libro } from './xlsx';
import type { Valor } from './xlsx';

export type FilaMaestro = Record<string, Valor>;
export type FilaOferta = Record<string, Valor>;

export type Maestro = {
  catalogo: FilaMaestro[];
  ofertas: FilaOferta[];
};

export function readMaster(libro: Libro): FilaMaestro[] {
  if (!libro.tieneHoja('MAESTRO')) throw new Error("El maestro no tiene hoja 'MAESTRO'.");
  const hoja = libro.hoja('MAESTRO');

  const nRows = hoja.ultimaFila;
  const nCols = hoja.ultimaColumna;
  const headers = new Map<string, number>();
  let country = '';

  for (let c = 1; c <= nCols; c++) {
    // En una celda fusionada solo la primera columna trae valor -> el pais se
    // arrastra hacia la derecha por todo su bloque de 6 columnas de imagen.
    const r1 = hoja.get(1, c);
    if (r1 !== null && String(r1) !== '') country = getCountryCode(String(r1));

    const r2 = hoja.get(2, c);
    if (r2 === null || String(r2) === '') continue;
    const label = String(r2).trim();
    const m = /^image\s*(\d+)/i.exec(label);
    const key = m ? `img_${country}_${m[1]}` : label;
    if (!headers.has(key)) headers.set(key, c); // primera aparicion gana
  }

  const list: FilaMaestro[] = [];
  for (let r = 3; r <= nRows; r++) {
    const o: FilaMaestro = {};
    for (const [k, c] of headers) o[k] = hoja.get(r, c);
    if (!esVacio(o['sku_canonico']) || !esVacio(o['ean'])) list.push(o);
  }
  return list;
}

export function readOfertas(libro: Libro): FilaOferta[] {
  if (!libro.tieneHoja('Ofertas')) {
    throw new Error("El maestro no tiene hoja 'Ofertas' (precios/stock).");
  }
  const hoja = libro.hoja('Ofertas');

  const nRows = hoja.ultimaFila;
  const nCols = hoja.ultimaColumna;
  const headers = new Map<string, number>();
  for (let c = 1; c <= nCols; c++) {
    const h = hoja.get(1, c);
    if (h !== null && String(h) !== '') headers.set(String(h), c);
  }

  const list: FilaOferta[] = [];
  for (let r = 2; r <= nRows; r++) {
    const o: FilaOferta = {};
    for (const [k, c] of headers) o[k] = hoja.get(r, c);
    if (!esVacio(o['Marketplace']) && !esVacio(o['EAN'])) list.push(o);
  }
  return list;
}

export function readMaestro(buf: ArrayBuffer | Uint8Array): Maestro {
  const libro = Libro.abrir(buf);
  return { catalogo: readMaster(libro), ofertas: readOfertas(libro) };
}

function esVacio(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === '';
}
