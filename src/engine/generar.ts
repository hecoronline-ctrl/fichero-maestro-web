/**
 * Motor de generacion — port de Generar.ps1 (Build-OfferRows + Invoke-Generar).
 *
 * Clona la plantilla del portal y rellena columnas por etiqueta de cabecera o por
 * indice fijo, segun el Mapa del config. Modos:
 *   Reemplazar  -> limpia las filas de datos y reescribe todas
 *   Actualizar  -> localiza la fila por clave y refresca solo esos campos
 */
import type { BloqueCfg, MapaItem, Marketplace } from '../config/marketplaces';
import type { FilaMaestro, FilaOferta, Maestro } from './maestro';
import { blobXlsx, fetchAsset, getColIndexByLabel, isEmpty, stamp } from './excel';
import { Libro } from './xlsx';
import type { Hoja, Valor } from './xlsx';

export type Resultado = {
  nombre: string;
  blob: Blob;
  bytes: Uint8Array;
  filas: number;
  avisos: string[];
};

type MapaResuelto = MapaItem & { _col: number; _campo?: string; _preserved?: Valor };

/**
 * Filas de oferta de un marketplace/pais, con el SKU del portal resuelto desde
 * el catalogo por EAN (cfg.skuCampo). Omite las filas sin precio o sin SKU.
 */
export function buildOfferRows(
  mp: Marketplace,
  pais: string,
  maestro: Maestro,
  avisos: string[],
): FilaOferta[] {
  const cfg = mp.ofertas;
  if (!cfg) return [];
  const skuCampo = cfg.skuCampo ?? 'sku_canonico';

  const byEan = new Map<string, FilaMaestro>();
  for (const c of maestro.catalogo) {
    const e = String(c['ean'] ?? '').trim();
    if (e) byEan.set(e, c);
  }

  const filas: FilaOferta[] = [];
  let sinPrecio = 0;
  let sinSku = 0;

  for (const o of maestro.ofertas) {
    if (String(o['Marketplace'] ?? '') !== mp.id) continue;
    const pa = String(o['Pais'] ?? '').trim();
    if (!(pa === pais || pa === 'ALL' || pais === 'ALL')) continue;
    if (isEmpty(o['Precio']) || String(o['Precio']).trim() === '') {
      sinPrecio++;
      continue;
    }
    const ean = String(o['EAN'] ?? '').trim();
    const cat = byEan.get(ean);
    const sku = cat ? cat[skuCampo] : null;
    if (isEmpty(sku)) {
      sinSku++;
      continue;
    }

    const fila: FilaOferta = { ...o, SKU: sku };

    // --- Enriquecimiento config-driven (disponible para portales tipo Makro) ---
    if (cfg.quitarIvaPorPais && cfg.quitarIvaPorPais[pais] !== undefined) {
      const vat = Number(cfg.quitarIvaPorPais[pais]);
      const neto = Number(o['Precio']) / (1 + vat);
      fila['NetPrice'] = redondear(neto, 2);
      if (cfg.descuentosCantidad) {
        for (const [campo, pct] of Object.entries(cfg.descuentosCantidad)) {
          fila[campo] = redondear(neto * (1 - Number(pct)), 2);
        }
      }
    }
    if (cfg.shippingGroupPorModelo && cat) {
      const m = /\.(\d{3})/.exec(String(cat['sku_canonico'] ?? ''));
      const modelo = m ? m[1] : '';
      if (modelo && cfg.shippingGroupPorModelo[modelo]) {
        fila['ShippingGroup'] = cfg.shippingGroupPorModelo[modelo];
      }
    }

    filas.push(fila);
  }

  if (sinPrecio > 0) avisos.push(`${sinPrecio} ofertas omitidas por no tener precio.`);
  if (sinSku > 0) {
    avisos.push(`${sinSku} ofertas omitidas (EAN sin SKU '${skuCampo}' en el catalogo).`);
  }
  return filas;
}

/** Ruta relativa de la plantilla para un marketplace/tipo/pais. */
export function rutaPlantilla(mp: Marketplace, tipo: 'catalogo' | 'ofertas', pais: string): string {
  const cfg = mp[tipo];
  const ruta = cfg?.plantillasPais
    ? cfg.plantillasPais[pais]
    : cfg?.plantilla?.replace('{PAIS}', pais);
  if (!ruta) throw new Error(`No hay plantilla para ${mp.id}/${pais}`);
  return ruta;
}

export async function generar(
  mp: Marketplace,
  tipo: 'catalogo' | 'ofertas',
  pais: string,
  maestro: Maestro,
): Promise<Resultado> {
  const plantilla = await fetchAsset(`plantillas/${rutaPlantilla(mp, tipo, pais)}`);
  return generarConPlantilla(mp, tipo, pais, maestro, plantilla);
}

/**
 * Igual que generar() pero recibiendo los bytes de la plantilla. Separado para
 * poder ejecutar el motor fuera del navegador (script de validacion en Node).
 */
export function generarConPlantilla(
  mp: Marketplace,
  tipo: 'catalogo' | 'ofertas',
  pais: string,
  maestro: Maestro,
  plantilla: ArrayBuffer | Uint8Array,
): Resultado {
  const cfg = mp[tipo];
  if (!cfg) throw new Error(`'${mp.nombre}' no tiene '${tipo}' implementado todavia.`);

  const avisos: string[] = [];
  const filas: (FilaMaestro | FilaOferta)[] =
    tipo === 'ofertas' ? buildOfferRows(mp, pais, maestro, avisos) : maestro.catalogo;
  if (filas.length === 0) throw new Error('No hay filas que escribir.');

  const libro = Libro.abrir(plantilla);
  if (!libro.tieneHoja(cfg.hoja)) {
    throw new Error(`La plantilla no tiene la hoja '${cfg.hoja}'.`);
  }
  const hoja = libro.hoja(cfg.hoja);
  const escritas = rellenar(hoja, cfg, filas, pais, avisos);

  const ruta = rutaPlantilla(mp, tipo, pais);
  const ext = ruta.slice(ruta.lastIndexOf('.'));
  const bytes = libro.guardar();
  return {
    nombre: `${mp.id}_${pais}_${tipo}_${stamp()}${ext}`,
    blob: blobXlsx(bytes),
    bytes,
    filas: escritas,
    avisos,
  };
}

/** Escribe las filas en la hoja segun el Mapa. Devuelve cuantas se escribieron. */
function rellenar(
  hoja: Hoja,
  cfg: BloqueCfg,
  filasIn: (FilaMaestro | FilaOferta)[],
  pais: string,
  avisos: string[],
): number {
  let filas = filasIn;
  const modo = cfg.modo ?? 'Reemplazar';
  const clave = cfg.clave ?? 'SKU';
  const nRows = hoja.ultimaFila;
  const nCols = hoja.ultimaColumna;
  const nColsLabel = Math.max(nCols, 250);

  const imgPais = cfg.imgPaisPorPais?.[pais] ?? cfg.imgPais ?? 'es';

  const mapa: MapaResuelto[] = cfg.mapa.map((m) => {
    const col =
      m.col !== undefined
        ? m.col
        : getColIndexByLabel(hoja, cfg.filaCabecera, nColsLabel, m.etiqueta ?? '');
    const campo = m.campo ? m.campo.replace('{IMG}', imgPais) : undefined;
    if (col === 0) avisos.push(`No se encontro columna para '${m.etiqueta ?? m.campo}'.`);
    return { ...m, _col: col, _campo: campo };
  });

  let escritas = 0;

  if (modo === 'Actualizar') {
    const claveCol = mapa.find((m) => m.campo === clave)?._col ?? 0;
    const porClave = new Map<string, FilaMaestro | FilaOferta>();
    for (const f of filas) {
      const k = String(f[clave] ?? '').trim();
      if (k) porClave.set(k, f);
    }
    for (let r = cfg.filaDatos; r <= nRows; r++) {
      const k = hoja.texto(r, claveCol);
      const fila = k ? porClave.get(k) : undefined;
      if (!fila) continue;
      for (const m of mapa) {
        if (m._col === 0 || m.campo === clave) continue;
        const val = m.literal !== undefined ? m.literal.replace('{PAIS}', pais) : fila[m._campo!];
        if (!isEmpty(val)) hoja.set(r, m._col, val as Valor);
      }
      escritas++;
    }
    return escritas;
  }

  // --- Reemplazar ---
  // Si el portal SOLO vende los EAN que ya trae su plantilla, filtrar ANTES de limpiar.
  if (cfg.soloEanDePlantilla) {
    const eanCol = mapa.find((m) => m.campo === 'EAN')?._col ?? 0;
    if (eanCol) {
      const permitidos = new Set<string>();
      for (let r = cfg.filaDatos; r <= nRows; r++) {
        const e = hoja.texto(r, eanCol);
        if (e) permitidos.add(e);
      }
      const antes = filas.length;
      filas = filas.filter((f) => permitidos.has(String(f['EAN'] ?? '').trim()));
      avisos.push(
        `La plantilla vende ${permitidos.size} productos; se generan ${filas.length} de ${antes}.`,
      );
    }
  }

  // Conservar los valores marcados DesdePlantilla ANTES de limpiar.
  for (const m of mapa) {
    if (m._col !== 0 && m.desdePlantilla) m._preserved = hoja.get(cfg.filaDatos, m._col);
  }

  // Capturar el formato de la 1a fila de datos ANTES de limpiar, para que las
  // filas nuevas salgan con el estilo que la plantilla del portal traia.
  const estilos = hoja.estilosDeFila(cfg.filaDatos);
  for (let r = cfg.filaDatos; r <= nRows; r++) hoja.limpiarFila(r);

  let r = cfg.filaDatos;
  for (const fila of filas) {
    for (const m of mapa) {
      if (m._col === 0) continue;
      const val =
        m.literal !== undefined
          ? m.literal.replace('{PAIS}', pais)
          : m.desdePlantilla
            ? m._preserved
            : fila[m._campo!];
      if (!isEmpty(val)) hoja.set(r, m._col, val as Valor, estilos);
    }
    r++;
    escritas++;
  }

  // Quitar las filas sobrantes de la plantilla que ya no llevan datos.
  if (r <= nRows) hoja.eliminarFilasDesde(r);
  return escritas;
}

function redondear(n: number, dec: number): number {
  const f = Math.pow(10, dec);
  return Math.round(n * f) / f;
}
