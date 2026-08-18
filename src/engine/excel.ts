/**
 * Utilidades del motor — equivalente a _sistema/lib/ExcelLib.ps1.
 * La manipulacion del .xlsx en si vive en xlsx.ts.
 */
import type { Hoja } from './xlsx';

/** Quita acentos y normaliza: mismo criterio que Remove-Diacritics del .ps1. */
export function removeDiacritics(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas combinantes
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Encabezado de pais (fila 1 del bloque de imagenes) -> codigo corto. */
export function getCountryCode(name: string): string {
  const n = removeDiacritics(name).toUpperCase();
  if (n.startsWith('ESPA')) return 'es';
  if (n.startsWith('ITAL')) return 'it';
  if (n.startsWith('FRAN')) return 'fr';
  if (n.startsWith('ALEM')) return 'de';
  if (n.startsWith('REIN')) return 'uk'; // Reino Unido / ingles
  if (n.startsWith('PORT')) return 'pt';
  if (n.startsWith('PAIS')) return 'nl'; // Paises Bajos
  return 'xx';
}

/** True si el valor cuenta como "vacio" segun el criterio del motor PS. */
export function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || String(v) === '';
}

/**
 * Indice de la columna cuya cabecera contiene la cadena dada (sin acentos,
 * insensible a mayusculas). 0 si no se encuentra. = Get-ColIndexByLabel.
 */
export function getColIndexByLabel(
  hoja: Hoja,
  headerRow: number,
  maxCols: number,
  contains: string,
): number {
  const needle = removeDiacritics(contains);
  if (!needle) return 0;
  for (let c = 1; c <= maxCols; c++) {
    const v = hoja.get(headerRow, c);
    if (v !== null && v !== undefined) {
      if (removeDiacritics(String(v)).includes(needle)) return c;
    }
  }
  return 0;
}

/** Descarga un asset estatico (plantilla o maestro) del propio sitio. */
export async function fetchAsset(path: string): Promise<ArrayBuffer> {
  const url = import.meta.env.BASE_URL + encodeURI(path).replace(/^\//, '');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${res.status})`);
  return res.arrayBuffer();
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Blob de un .xlsx a partir de los bytes. El cast evita el choque de tipos entre
 * Uint8Array<ArrayBufferLike> (lo que devuelve fflate) y el BlobPart del DOM, que
 * exige ArrayBuffer; en tiempo de ejecucion es exactamente el mismo buffer.
 */
export function blobXlsx(bytes: Uint8Array): Blob {
  return new Blob([bytes as unknown as BlobPart], { type: TIPO_XLSX });
}

/** Dispara la descarga en el navegador. */
export function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Marca de tiempo yyyyMMdd_HHmmss para los nombres de fichero. */
export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}
