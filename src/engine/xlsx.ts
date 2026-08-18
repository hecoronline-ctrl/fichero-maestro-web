/**
 * Capa .xlsx quirurgica: abre el fichero como ZIP y modifica UNICAMENTE el XML de
 * la hoja de datos. Todo lo demas (estilos, validaciones, hojas de referencia,
 * relaciones) se reempaqueta byte a byte igual que en la plantilla original.
 *
 * Por que no una libreria de Excel completa: la plantilla de Leroy trae una hoja
 * oculta ReferenceData de 26 x 30.228 celdas (los desplegables de Mirakl). Cargar
 * el libro entero cuesta ~900 MB y varios minutos, y al re-guardarlo se pierden
 * las validaciones. Aqui solo se parsea la hoja que se escribe (74 x 32), asi que
 * es instantaneo, cabe de sobra en el navegador y la plantilla queda intacta.
 */
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

export type Valor = string | number | boolean | null;

type Celda = {
  /** atributos del <c> distintos de r/t (sobre todo s = estilo) */
  attrs: string;
  t?: string;
  /** contenido interno crudo del <c> */
  inner: string;
};

type Fila = {
  attrs: string;
  celdas: Map<number, Celda>;
};

export class Hoja {
  private pre: string;
  private post: string;
  private filas = new Map<number, Fila>();
  private sst: string[];

  constructor(xml: string, sst: string[]) {
    this.sst = sst;
    const vacio = /<sheetData\s*\/>/.exec(xml);
    if (vacio) {
      this.pre = xml.slice(0, vacio.index) + '<sheetData>';
      this.post = '</sheetData>' + xml.slice(vacio.index + vacio[0].length);
      return;
    }
    const ini = xml.indexOf('<sheetData');
    const finAbre = xml.indexOf('>', ini);
    const fin = xml.indexOf('</sheetData>');
    if (ini < 0 || fin < 0) throw new Error('La hoja no tiene <sheetData>.');
    this.pre = xml.slice(0, finAbre + 1);
    this.post = xml.slice(fin);
    this.parseFilas(xml.slice(finAbre + 1, fin));
  }

  private parseFilas(sd: string): void {
    const reFila = /<row([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g;
    let m: RegExpExecArray | null;
    while ((m = reFila.exec(sd))) {
      const attrs = m[1];
      const cuerpo = m[3] ?? '';
      const r = Number(/\br="(\d+)"/.exec(attrs)?.[1] ?? 0);
      if (!r) continue;
      const fila: Fila = { attrs: attrs.replace(/\s*\br="\d+"/, ''), celdas: new Map() };
      const reCelda = /<c([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g;
      let c: RegExpExecArray | null;
      while ((c = reCelda.exec(cuerpo))) {
        const cAttrs = c[1];
        const ref = /\br="([A-Z]+)\d+"/.exec(cAttrs)?.[1];
        if (!ref) continue;
        const t = /\bt="([^"]*)"/.exec(cAttrs)?.[1];
        fila.celdas.set(colIndice(ref), {
          attrs: cAttrs.replace(/\s*\br="[A-Z]+\d+"/, '').replace(/\s*\bt="[^"]*"/, ''),
          t,
          inner: c[3] ?? '',
        });
      }
      this.filas.set(r, fila);
    }
  }

  /** Ultima fila con contenido (equivalente a Dimension.End.Row). */
  get ultimaFila(): number {
    let max = 0;
    for (const r of this.filas.keys()) if (r > max) max = r;
    return max;
  }

  /** Ultima columna con contenido (equivalente a Dimension.End.Column). */
  get ultimaColumna(): number {
    let max = 0;
    for (const fila of this.filas.values()) {
      for (const c of fila.celdas.keys()) if (c > max) max = c;
    }
    return max;
  }

  get(row: number, col: number): Valor {
    const celda = this.filas.get(row)?.celdas.get(col);
    if (!celda) return null;
    return this.valorDe(celda);
  }

  texto(row: number, col: number): string {
    const v = this.get(row, col);
    return v === null ? '' : String(v).trim();
  }

  private valorDe(celda: Celda): Valor {
    const { t, inner } = celda;
    if (t === 's') {
      const i = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? -1);
      return this.sst[i] ?? null;
    }
    if (t === 'inlineStr') {
      return textoDeIs(inner);
    }
    if (t === 'str') {
      return desescapar(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
    }
    if (t === 'b') {
      return /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] === '1';
    }
    if (t === 'e') return null;
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
    if (v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? v : n;
  }

  /**
   * Copia los atributos de estilo (s="N") de cada celda de una fila. Hay que
   * llamarlo ANTES de limpiar, para poder dar a las filas nuevas el formato que
   * la plantilla del portal tenia en su primera fila de datos.
   */
  estilosDeFila(row: number): Map<number, string> {
    const out = new Map<number, string>();
    const fila = this.filas.get(row);
    if (!fila) return out;
    for (const [c, celda] of fila.celdas) out.set(c, celda.attrs);
    return out;
  }

  /**
   * Escribe una celda conservando su estilo. Si la celda no existia, toma el
   * estilo del mapa `estilos` (ver estilosDeFila) para esa columna.
   */
  set(row: number, col: number, valor: Valor, estilos?: Map<number, string>): void {
    let fila = this.filas.get(row);
    if (!fila) {
      fila = { attrs: '', celdas: new Map() };
      this.filas.set(row, fila);
    }
    if (valor === null || valor === undefined || valor === '') {
      fila.celdas.delete(col);
      return;
    }
    const existente = fila.celdas.get(col);
    const attrs = existente?.attrs ?? estilos?.get(col) ?? '';

    if (typeof valor === 'number') {
      fila.celdas.set(col, { attrs, t: undefined, inner: `<v>${valor}</v>` });
    } else if (typeof valor === 'boolean') {
      fila.celdas.set(col, { attrs, t: 'b', inner: `<v>${valor ? 1 : 0}</v>` });
    } else {
      fila.celdas.set(col, {
        attrs,
        t: 'inlineStr',
        inner: `<is><t xml:space="preserve">${escapar(valor)}</t></is>`,
      });
    }
  }

  /** Borra el valor de todas las celdas de una fila (conserva el formato). */
  limpiarFila(row: number): void {
    this.filas.get(row)?.celdas.clear();
  }

  /** Elimina las filas vacias sobrantes a partir de una fila dada. */
  eliminarFilasDesde(row: number): void {
    for (const r of [...this.filas.keys()]) if (r >= row) this.filas.delete(r);
  }

  toXml(): string {
    const partes: string[] = [this.pre];
    const refs = [...this.filas.keys()].sort((a, b) => a - b);
    for (const r of refs) {
      const fila = this.filas.get(r)!;
      const celdas = [...fila.celdas.keys()].sort((a, b) => a - b);
      if (celdas.length === 0) {
        partes.push(`<row r="${r}"${fila.attrs}/>`);
        continue;
      }
      partes.push(`<row r="${r}"${fila.attrs}>`);
      for (const c of celdas) {
        const celda = fila.celdas.get(c)!;
        const t = celda.t ? ` t="${celda.t}"` : '';
        partes.push(`<c r="${colLetra(c)}${r}"${celda.attrs}${t}>${celda.inner}</c>`);
      }
      partes.push('</row>');
    }
    partes.push(this.post);
    return partes.join('');
  }
}

export class Libro {
  private ficheros: Record<string, Uint8Array>;
  private sst: string[];
  /** hojas ya parseadas, por ruta interna */
  private abiertas = new Map<string, Hoja>();

  private constructor(ficheros: Record<string, Uint8Array>, sst: string[]) {
    this.ficheros = ficheros;
    this.sst = sst;
  }

  static abrir(buf: ArrayBuffer | Uint8Array): Libro {
    const datos = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const ficheros = unzipSync(datos);
    const sst = leerSharedStrings(ficheros);
    return new Libro(ficheros, sst);
  }

  /** Nombres de las hojas, en orden. */
  get hojas(): string[] {
    const wb = strFromU8(this.ficheros['xl/workbook.xml']);
    return [...wb.matchAll(/<sheet[^>]*\bname="([^"]*)"/g)].map((m) => desescapar(m[1]));
  }

  private rutaDeHoja(nombre: string): string {
    const wb = strFromU8(this.ficheros['xl/workbook.xml']);
    let rid: string | undefined;
    for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
      const attrs = m[1];
      const n = /\bname="([^"]*)"/.exec(attrs)?.[1];
      if (n !== undefined && desescapar(n) === nombre) {
        rid = /\br:id="([^"]*)"/.exec(attrs)?.[1];
        break;
      }
    }
    if (!rid) throw new Error(`El libro no tiene la hoja '${nombre}'.`);
    const rels = strFromU8(this.ficheros['xl/_rels/workbook.xml.rels']);
    const re = new RegExp(`<Relationship[^>]*\\bId="${rid}"[^>]*>`);
    const rel = re.exec(rels)?.[0];
    const target = rel ? /\bTarget="([^"]*)"/.exec(rel)?.[1] : undefined;
    if (!target) throw new Error(`No se encontro la relacion de la hoja '${nombre}'.`);
    const limpio = target.replace(/^\//, '').replace(/^xl\//, '');
    return `xl/${limpio}`;
  }

  hoja(nombre: string): Hoja {
    const ruta = this.rutaDeHoja(nombre);
    let h = this.abiertas.get(ruta);
    if (!h) {
      h = new Hoja(strFromU8(this.ficheros[ruta]), this.sst);
      this.abiertas.set(ruta, h);
    }
    return h;
  }

  tieneHoja(nombre: string): boolean {
    return this.hojas.includes(nombre);
  }

  /** Reempaqueta el .xlsx con las hojas modificadas y el resto sin tocar. */
  guardar(): Uint8Array {
    const salida: Record<string, Uint8Array> = { ...this.ficheros };
    for (const [ruta, hoja] of this.abiertas) {
      salida[ruta] = strToU8(hoja.toXml());
    }
    return zipSync(salida, { level: 6 });
  }
}

// ---------------------------------------------------------------- utilidades

function leerSharedStrings(ficheros: Record<string, Uint8Array>): string[] {
  const raw = ficheros['xl/sharedStrings.xml'];
  if (!raw) return [];
  const xml = strFromU8(raw);
  const out: string[] = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    out.push(textoDeIs(m[1]));
  }
  return out;
}

/** Texto de un <si>/<is>, uniendo los <t> de todas las runs de texto enriquecido. */
function textoDeIs(inner: string): string {
  const partes = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => desescapar(m[1]));
  if (partes.length) return partes.join('');
  const solo = /<t\b[^>]*\/>/.test(inner) ? '' : null;
  return solo ?? '';
}

export function colLetra(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export function colIndice(letras: string): number {
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // caracteres de control no validos en XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}
