/**
 * Amazon ES — precio y stock con la plantilla OFICIAL de Seller Central:
 * ListingLoader.xlsm ("Añadir ofertas a productos que ya se venden en Amazon").
 *
 * Solo sirve para productos que YA existen en Amazon (no crea fichas nuevas).
 * Hoja 'Plantilla': 1 = settings de Amazon, 2 = aviso, 3 = grupos, 4 = etiquetas,
 * 5 = nombres de campo, 6 = ejemplo de Amazon, datos desde la fila 7 (dataRow=7 en
 * los settings). Se escribe SOLO esa hoja; el resto del .xlsm queda byte a byte igual.
 *
 * De donde sale cada dato:
 *   - SKU y ASIN: columnas amazon_sku_es / amazon_asin_es del maestro. Sin SKU la
 *     referencia NO sale: un SKU inventado crearia una oferta duplicada en Amazon.
 *   - Precio, stock y plazo: hoja Ofertas del maestro. Primero una fila de Amazon ES;
 *     si no hay, la de Leroy ALL (el precio de Espana, que tienen todos los productos)
 *     y, por ultimo, la de otro portal de Espana (nunca Makro, que va sin IVA).
 *   - Plantilla de envio: por modelo (AMAZON_ES_ENVIO).
 */
import { AMAZON_ES_ENVIO } from '../config/marketplaces';
import { stamp } from './excel';
import type { FilaMaestro, FilaOferta, Maestro } from './maestro';
import { modeloDeSku } from './makro';
import { Libro } from './xlsx';

const FILA_CAMPOS = 5;
const FILA_DATOS = 7;
const MERCADO = 'A1RKKUPIHCS9HS'; // Amazon.es

export type ResultadoLoader = {
  nombre: string;
  blob: Blob;
  filas: number;
  avisos: string[];
};

export function generarAmazonEsLoader(
  plantilla: ArrayBuffer | Uint8Array,
  maestro: Maestro,
): ResultadoLoader {
  const libro = Libro.abrir(plantilla);
  if (!libro.tieneHoja('Plantilla')) {
    throw new Error("La plantilla de Amazon no tiene la hoja 'Plantilla'.");
  }
  const hoja = libro.hoja('Plantilla');

  // columnas por nombre de campo (fila 5); se localizan por prefijo porque Amazon
  // alarga algunos nombres con el mercado y la audiencia
  const campos = new Map<string, number>();
  for (let c = 1; c <= hoja.ultimaColumna; c++) {
    const v = hoja.texto(FILA_CAMPOS, c);
    if (v) campos.set(v, c);
  }
  const col = (nombre: string): number => {
    const exacta = campos.get(nombre);
    if (exacta) return exacta;
    for (const [k, c] of campos) if (k.startsWith(nombre)) return c;
    throw new Error(`La plantilla de Amazon no tiene el campo '${nombre}'.`);
  };
  const oferta = `purchasable_offer[marketplace_id=${MERCADO}][audience=ALL]#1`;
  const C = {
    sku: col('contribution_sku#1.value'),
    accion: col('::record_action'),
    tipoId: col('externally_assigned_product_identifier#1.type'),
    id: col('externally_assigned_product_identifier#1.value'),
    asin: col('merchant_suggested_asin#1.value'),
    estado: col('condition_type#1.value'),
    canal: col('fulfillment_availability#1.fulfillment_channel_code'),
    cantidad: col('fulfillment_availability#1.quantity'),
    plazo: col('fulfillment_availability#1.lead_time_to_ship_max_days'),
    precio: col(`${oferta}.our_price#1.schedule#1.value`),
    envio: col(`merchant_shipping_group[marketplace_id=${MERCADO}]#1.value`),
  };

  // se parte de una hoja sin datos (por si la plantilla trae filas de otra vez)
  hoja.eliminarFilasDesde(FILA_DATOS);

  const sinSku: string[] = [];
  const sinDatos: string[] = [];
  const sinEnvio: string[] = [];
  let prestados = 0;
  let r = FILA_DATOS;

  for (const fila of maestro.catalogo) {
    const ref = t(fila['sku_canonico']);
    if (!ref) continue;
    const sku = t(fila['amazon_sku_es']);
    if (!sku) {
      sinSku.push(ref);
      continue;
    }
    const { oferta: o, prestado } = ofertaEs(maestro.ofertas, fila);
    const precio = numero(o?.['Precio']);
    const stock = numero(o?.['Stock']);
    if (precio === null && stock === null) {
      sinDatos.push(ref);
      continue;
    }
    if (prestado) prestados++;

    hoja.set(r, C.sku, sku);
    hoja.set(r, C.accion, 'Crear o editar');
    hoja.set(r, C.tipoId, 'EAN');
    hoja.set(r, C.id, t(fila['ean']));
    hoja.set(r, C.asin, t(fila['amazon_asin_es']));
    hoja.set(r, C.estado, 'Nuevo');
    hoja.set(r, C.canal, 'Logística por parte del vendedor (predeterminado)');
    if (stock !== null) hoja.set(r, C.cantidad, Math.max(0, Math.round(stock)));
    const plazo = numero(o?.['PlazoEnvio']);
    if (plazo !== null) hoja.set(r, C.plazo, plazo);
    if (precio !== null) hoja.set(r, C.precio, precio);
    const envio = AMAZON_ES_ENVIO[modeloDeSku(ref) ?? ''];
    if (envio) hoja.set(r, C.envio, envio);
    else sinEnvio.push(ref);
    r++;
  }

  const filas = r - FILA_DATOS;
  const avisos: string[] = [];
  if (sinSku.length > 0) {
    avisos.push(
      `${sinSku.length} referencias sin SKU de Amazon ES en el maestro (amazon_sku_es): no salen. ` +
        `p.ej. ${sinSku.slice(0, 3).join(', ')}.`,
    );
  }
  if (sinDatos.length > 0) {
    avisos.push(`${sinDatos.length} referencias sin precio ni stock en la hoja Ofertas: no salen.`);
  }
  if (prestados > 0) {
    avisos.push(
      `${prestados} precios y stocks son los de Espana de la hoja Ofertas (fila de Leroy): ` +
        `no hay filas propias de Amazon ES.`,
    );
  }
  if (sinEnvio.length > 0) {
    avisos.push(
      `${sinEnvio.length} sin plantilla de envio (modelo sin regla): ${sinEnvio.slice(0, 4).join(', ')}. ` +
        `Amazon mantiene la que ya tengan.`,
    );
  }

  const bytes = libro.guardar();
  return {
    nombre: `Amazon_ES_PrecioStock_${stamp()}.xlsm`,
    // mismo cast que blobXlsx (Uint8Array de fflate -> BlobPart)
    blob: new Blob([bytes as unknown as BlobPart], {
      type: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    }),
    filas,
    avisos,
  };
}

/**
 * Fila de precio/stock para Espana: Amazon ES > Leroy ALL > otro portal de Espana.
 * Leroy ALL va antes que el resto porque es la fila de Espana que tienen TODOS los
 * productos (taquillas, madera/antracita y bancos) y la que actualiza el CSV de precios;
 * asi el precio sale siempre del mismo sitio. Makro no cuenta: sus filas no son PVP.
 */
function ofertaEs(
  ofertas: FilaOferta[],
  fila: FilaMaestro,
): { oferta: FilaOferta | null; prestado: boolean } {
  const ean = t(fila['ean']);
  const ref = t(fila['sku_canonico']);
  const suyas = ofertas.filter((o) => t(o['EAN']) === ean || (ref !== '' && t(o['ref']) === ref));
  const pais = (o: FilaOferta) => t(o['Pais']).toUpperCase();
  const portal = (o: FilaOferta) => t(o['Marketplace']).toLowerCase();
  const amazon = suyas.find((o) => portal(o) === 'amazon' && pais(o) === 'ES');
  if (amazon) return { oferta: amazon, prestado: false };
  const all = suyas.find((o) => pais(o) === 'ALL' && numero(o['Precio']) !== null);
  if (all) return { oferta: all, prestado: true };
  const es = suyas.find((o) => pais(o) === 'ES' && portal(o) !== 'makro' && numero(o['Precio']) !== null);
  return { oferta: es ?? null, prestado: es !== undefined };
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

function t(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}
