/**
 * Makro — fichas de producto (multi_template {ES,IT,FR,DE,NL_PT}.xlsx).
 *
 * Fuente de cada campo:
 *   - MAESTRO: titulo, descripcion, imagenes 2-5, color, pais de fabricacion,
 *     medidas y peso, material, serie (sku_canonico sin color + "_PADRE").
 *   - FICHAS YA ENVIADAS (datos/makro_fichas.json, ver scripts/extraer-fichas-makro.ts):
 *     lo que el maestro no tiene -> key features aceptadas, textos NL, medidas de
 *     embalaje, imagen principal limpia (sin sello de pais), componentes...
 *     Un producto sin ficha toma la de un "hermano" (mismo modelo, otro color) y se avisa.
 *   - REGLAS DE MAKRO (config/makroFichas.ts): categoria, marca, LOV de color,
 *     GPSR, nombre <= 150, sin Google Drive, sin contacto en la descripcion.
 */
import {
  MAKRO_FICHAS,
  MAKRO_FICHAS_CATEGORIA,
  MAKRO_FICHAS_COLOR,
  MAKRO_FICHAS_MARCA,
  MAKRO_MAX_NOMBRE,
  MAKRO_PARRAFO_PROHIBIDO,
  MAKRO_RELLENO_NOMBRE,
  claveCabeceras,
} from '../config/makroFichas';
import type { FicheroFichas, IdiomaFicha } from '../config/makroFichas';
import type { FilaMaestro } from './maestro';
import { blobXlsx, stamp } from './excel';
import { Libro } from './xlsx';
import type { Valor } from './xlsx';

export type FichasEnviadas = Record<string, Record<string, Valor>>;
export type FiltroFichas = 'todos' | 'taquillas' | 'bancos' | 'nuevos';

export type ResultadoFichas = {
  fichero: string;
  nombre: string;
  blob: Blob;
  filas: number;
  avisos: string[];
  errores: string[];
};

const HOJA = 'Products Template';
const FILA_CAB = 7;
const FILA_DATOS = 8;
const ORDEN_COLOR = ['G', 'N', 'B', 'B-N', 'M', 'A'];
const N_IMG = 5;
const N_KF = 5;

export const FICHEROS_FICHAS = MAKRO_FICHAS.map((f) => f.fichero);

export function generarFichasMakro(
  fichero: string,
  plantilla: ArrayBuffer | Uint8Array,
  catalogo: FilaMaestro[],
  enviadas: FichasEnviadas,
  filtro: FiltroFichas = 'todos',
): ResultadoFichas {
  const cfg = MAKRO_FICHAS.find((f) => f.fichero === fichero);
  if (!cfg) throw new Error(`Fichero Makro desconocido: ${fichero}`);

  const libro = Libro.abrir(plantilla);
  if (!libro.tieneHoja(HOJA)) throw new Error(`La plantilla no tiene la hoja '${HOJA}'.`);
  const hoja = libro.hoja(HOJA);
  const cab = claveCabeceras((c) => hoja.texto(FILA_CAB, c), hoja.ultimaColumna);
  if (!cab.has('GTIN')) throw new Error('La plantilla de Makro no tiene la columna GTIN.');
  hoja.eliminarFilasDesde(FILA_DATOS);

  const productos = catalogo.filter((p) => {
    const ean = txt(p['ean']);
    if (!ean) return false;
    const banco = txt(p['tipo']) === 'MET';
    if (filtro === 'taquillas') return !banco;
    if (filtro === 'bancos') return banco;
    if (filtro === 'nuevos') return !enviadas[`${fichero}|${ean}`];
    return true;
  });

  const avisos: string[] = [];
  const errores: string[] = [];
  let r = FILA_DATOS;
  for (const p of productos) {
    const fila = construirFila(cfg, p, catalogo, enviadas, avisos, errores);
    for (const [k, v] of Object.entries(fila)) {
      const c = cab.get(k);
      if (c) hoja.set(r, c, v);
    }
    r++;
  }

  const bytes = libro.guardar();
  return {
    fichero,
    nombre: `Makro_${fichero}_fichas_${stamp()}.xlsx`,
    blob: blobXlsx(bytes),
    filas: productos.length,
    avisos,
    errores,
  };
}

function construirFila(
  cfg: FicheroFichas,
  p: FilaMaestro,
  catalogo: FilaMaestro[],
  enviadas: FichasEnviadas,
  avisos: string[],
  errores: string[],
): Record<string, Valor> {
  const ean = txt(p['ean']);
  const sku = txt(p['sku_canonico']);
  const id = `${sku} (${ean})`;

  const propia = enviadas[`${cfg.fichero}|${ean}`];
  const hermano = propia ? null : buscarHermano(cfg.fichero, p, catalogo, enviadas);
  if (!propia) {
    avisos.push(
      hermano
        ? `${id}: sin ficha previa en Makro; medidas de embalaje y key features copiadas de ${hermano.sku}. Revísalas.`
        : `${id}: sin ficha previa en Makro ni hermano; faltan medidas de embalaje.`,
    );
  }
  // Base: la ficha ya enviada (o la del hermano); encima se escribe lo del maestro.
  const f: Record<string, Valor> = { ...(propia ?? hermano?.ficha ?? {}) };

  f['Target markets'] = cfg.mercados;
  f['GTIN'] = Number(ean);
  const cat = MAKRO_FICHAS_CATEGORIA[txt(p['tipo'])] ?? MAKRO_FICHAS_CATEGORIA['*'];
  f['Product category'] = cat.id;
  f['Product category name'] = cat.nombre;
  f['Manufacturer'] = MAKRO_FICHAS_MARCA;
  f['Brand'] = MAKRO_FICHAS_MARCA;

  // Imagenes: 2-5 del maestro. La 1 (principal) se conserva si la ficha enviada la
  // tenia: en Makro va la version limpia, sin el sello de pais de la del maestro.
  for (let i = 1; i <= N_IMG; i++) {
    const delMaestro = txt(p[`img_${cfg.imagenes}_${i}`]);
    const enviada = txt(propia?.[`Image#${i}`]);
    const url = i === 1 && enviada ? enviada : delMaestro || enviada;
    f[`Image#${i}`] = url || null;
    if (!url) errores.push(`${id}: falta la imagen ${i} (bloque ${cfg.imagenes} del maestro).`);
  }

  for (const idioma of cfg.idiomas) textos(f, idioma, p, propia, hermano, id, avisos, errores);

  const color = MAKRO_FICHAS_COLOR[txt(p['color'])];
  if (color) f['Color'] = color;
  else errores.push(`${id}: color '${txt(p['color'])}' sin equivalente en la lista de Makro.`);
  if (txt(p['pais_fabricacion'])) f['Country of Manufacture'] = txt(p['pais_fabricacion']);

  medida(f, 'Height', p['alto_cm'], 'cm');
  medida(f, 'Width', p['ancho_cm'], 'cm');
  medida(f, 'Depth', p['fondo_cm'], 'cm');
  // Peso: en la columna que ya usaba la ficha (taquillas = Gross weight, bancos = Weight (net)).
  const pesoCol = 'Weight (net)' in f && !('Gross weight' in f) ? 'Weight (net)' : 'Gross weight';
  medida(f, pesoCol, p['peso_kg'], 'kg');
  for (const m of ['Height (gross)', 'Length (gross)', 'Width (gross)', 'Length']) {
    if (num(f[m]) !== null && !f[`${m} Unit`]) f[`${m} Unit`] = 'cm';
  }

  f['Quantity'] = 1;
  f['Material'] = txt(p['material']) || 'Metal';
  f['Product series'] = `${sku.replace(/_[^_.]+$/, '')}_PADRE`;

  // Ningun enlace de Google Drive, en ninguna columna (ErrorIM02).
  for (const [k, v] of Object.entries(f)) {
    if (typeof v === 'string' && /drive\.google|docs\.google/i.test(v)) {
      f[k] = null;
      avisos.push(`${id}: quitado enlace de Google Drive de '${k.replace(/#\d+$/, '')}'.`);
    }
  }
  return f;
}

function textos(
  f: Record<string, Valor>,
  idioma: IdiomaFicha,
  p: FilaMaestro,
  propia: Record<string, Valor> | undefined,
  hermano: { sku: string; ficha: Record<string, Valor> } | null,
  id: string,
  avisos: string[],
  errores: string[],
): void {
  const L = idioma.codigo;
  const m = idioma.maestro;
  const kNombre = `Product name ${L}`;
  const kDesc = `Description ${L}`;

  // Nombre: el del maestro; si no cabe, el ya aceptado por Makro; si no, se acorta.
  let nombre = m ? txt(p[`titulo_${m}`]) : '';
  const nombreEnviado = txt(propia?.[kNombre]);
  if (!nombre) {
    nombre = nombreEnviado || txt(hermano?.ficha[kNombre]);
    if (!propia && nombre) avisos.push(`${id}: nombre ${L} copiado de ${hermano?.sku}. Revísalo.`);
  }
  if (nombre.length > MAKRO_MAX_NOMBRE) {
    if (nombreEnviado && nombreEnviado.length <= MAKRO_MAX_NOMBRE) {
      avisos.push(`${id}: nombre ${L} del maestro con ${nombre.length} caracteres; se usa el ya aceptado por Makro.`);
      nombre = nombreEnviado;
    } else {
      const antes = nombre.length;
      nombre = acortarNombre(nombre);
      avisos.push(`${id}: nombre ${L} acortado de ${antes} a ${nombre.length} caracteres.`);
    }
  }
  f[kNombre] = nombre || null;
  if (!nombre) errores.push(`${id}: sin nombre ${L}.`);

  // Descripcion: la del maestro sin parrafos de contacto/redes/postventa (ErrorPD02).
  let desc = m ? txt(p[`descripcion_${m}`]) : '';
  if (!desc) desc = txt(propia?.[kDesc]) || txt(hermano?.ficha[kDesc]);
  const limpia = limpiarDescripcion(desc);
  if (limpia !== desc) avisos.push(`${id}: quitado de la descripción ${L} el párrafo de contacto/redes sociales.`);
  f[kDesc] = limpia || null;
  if (!limpia) errores.push(`${id}: sin descripción ${L}.`);
  else if (limpia.length > 4000) errores.push(`${id}: descripción ${L} con ${limpia.length} caracteres (máx. 4000).`);

  // GPSR obligatorio (ERROR-0097).
  f[`Product safety instructions ${L}`] = idioma.seguridad;

  // Key features: las ya aceptadas (ErrorKF01 si repiten la descripcion).
  const kf = (fuente?: Record<string, Valor>) =>
    Array.from({ length: N_KF }, (_, i) => txt(fuente?.[`Key feature ${L}#${i + 1}`])).filter(Boolean);
  let features = kf(propia);
  if (!features.length) features = kf(hermano?.ficha);
  if (!features.length && m) {
    features = txt(p[`bullets_${m}`])
      .split(/\r?\n/)
      .map((s) => s.replace(/^[•\-\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, N_KF);
    if (features.length) avisos.push(`${id}: key features ${L} sacadas de los bullets del maestro. Revisa que no repitan la descripción.`);
  }
  if (!features.length) errores.push(`${id}: sin key features ${L}.`);
  for (let i = 1; i <= N_KF; i++) f[`Key feature ${L}#${i}`] = features[i - 1] ?? null;

  const kComp = `Included components ${L}`;
  f[kComp] = txt(f[kComp]) || idioma.componentes;
}

/** Mismo modelo en otro color que ya tenga ficha en este fichero. */
function buscarHermano(
  fichero: string,
  p: FilaMaestro,
  catalogo: FilaMaestro[],
  enviadas: FichasEnviadas,
): { sku: string; ficha: Record<string, Valor> } | null {
  const base = (s: string) => s.replace(/_[^_.]+$/, '');
  const miBase = base(txt(p['sku_canonico']));
  const candidatos = catalogo
    .filter((o) => base(txt(o['sku_canonico'])) === miBase && enviadas[`${fichero}|${txt(o['ean'])}`])
    .sort((a, b) => ordenColor(txt(a['color'])) - ordenColor(txt(b['color'])));
  const h = candidatos[0];
  return h ? { sku: txt(h['sku_canonico']), ficha: enviadas[`${fichero}|${txt(h['ean'])}`] } : null;
}

function ordenColor(c: string): number {
  const i = ORDEN_COLOR.indexOf(c);
  return i < 0 ? 99 : i;
}

/**
 * Deja el nombre en 150 caracteres: primero quita relleno ("di alta qualità"...);
 * si aun no cabe, corta en la ultima coma o espacio, conservando el "(Color)" final.
 */
export function acortarNombre(nombre: string): string {
  let n = nombre;
  for (const r of MAKRO_RELLENO_NOMBRE) {
    if (n.length <= MAKRO_MAX_NOMBRE) break;
    n = n.split(r).join('');
  }
  n = n.replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim();
  if (n.length <= MAKRO_MAX_NOMBRE) return n;

  const sufijo = /\s*\([^()]*\)$/.exec(n)?.[0] ?? '';
  const cuerpo = n.slice(0, n.length - sufijo.length);
  const cabe = MAKRO_MAX_NOMBRE - sufijo.length;
  let corte = cuerpo.slice(0, cabe);
  const coma = corte.lastIndexOf(',');
  const espacio = corte.lastIndexOf(' ');
  if (coma > cabe * 0.6) corte = corte.slice(0, coma);
  else if (espacio > 0) corte = corte.slice(0, espacio);
  return (corte.replace(/[\s,;:-]+$/, '') + sufijo).trim();
}

/** Quita los parrafos con contacto, redes sociales, postventa o enlaces. */
export function limpiarDescripcion(desc: string): string {
  if (!desc) return '';
  const lineas = desc.split(/\r?\n/);
  const fuera = lineas.filter((l) => !MAKRO_PARRAFO_PROHIBIDO.test(l));
  if (fuera.length === lineas.length) return desc;
  return fuera.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function medida(f: Record<string, Valor>, campo: string, valor: Valor, unidad: string): void {
  const n = num(valor);
  if (n === null) return;
  f[campo] = n;
  f[`${campo} Unit`] = unidad;
}

function num(v: Valor | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function txt(v: Valor | undefined): string {
  return v === null || v === undefined ? '' : String(v).trim();
}
