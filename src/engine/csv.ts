/**
 * Lector de CSV equivalente a Import-Csv: primera fila = cabeceras, comillas
 * dobles con escape "" y detección automática del separador (, o ;), porque
 * Excel en español exporta con punto y coma.
 */
export type FilaCsv = Record<string, string>;

export function parseCsv(texto: string): FilaCsv[] {
  const limpio = texto.replace(/^﻿/, '');
  const delim = detectarDelimitador(limpio);
  const filas = tokenizar(limpio, delim);
  if (filas.length === 0) return [];

  const cabeceras = filas[0].map((h) => h.trim());
  const out: FilaCsv[] = [];
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i];
    // saltar líneas totalmente vacías
    if (f.length === 1 && f[0].trim() === '') continue;
    const o: FilaCsv = {};
    cabeceras.forEach((h, j) => {
      o[h] = (f[j] ?? '').trim();
    });
    out.push(o);
  }
  return out;
}

/** Cuenta separadores fuera de comillas en la primera línea y elige el mayor. */
function detectarDelimitador(texto: string): string {
  const primeraLinea = texto.split(/\r?\n/, 1)[0] ?? '';
  let comas = 0;
  let puntoComas = 0;
  let dentro = false;
  for (const ch of primeraLinea) {
    if (ch === '"') dentro = !dentro;
    else if (!dentro && ch === ',') comas++;
    else if (!dentro && ch === ';') puntoComas++;
  }
  return puntoComas > comas ? ';' : ',';
}

/** Divide el texto completo respetando comillas y saltos de línea internos. */
function tokenizar(texto: string, delim: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let dentro = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (dentro) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentro = false;
        }
      } else {
        campo += ch;
      }
      continue;
    }
    if (ch === '"') {
      dentro = true;
    } else if (ch === delim) {
      fila.push(campo);
      campo = '';
    } else if (ch === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else if (ch !== '\r') {
      campo += ch;
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

/** Busca una cabecera de forma tolerante (sin distinguir mayúsculas ni espacios). */
export function campo(fila: FilaCsv, ...nombres: string[]): string {
  for (const n of nombres) {
    if (fila[n] !== undefined) return fila[n];
  }
  const claves = Object.keys(fila);
  for (const n of nombres) {
    const k = claves.find((c) => c.toLowerCase().trim() === n.toLowerCase().trim());
    if (k) return fila[k];
  }
  return '';
}
