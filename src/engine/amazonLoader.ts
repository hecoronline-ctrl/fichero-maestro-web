/**
 * Amazon ES con las plantillas OFICIALES de Seller Central (las dos de 01/10/2026):
 *
 *   - Catalogo -> ListingLoader.xlsm ("Cargador de listings"): da de alta / edita el
 *     listing de un producto que YA existe en Amazon (por EAN + ASIN), con la oferta y
 *     los datos fisicos (peso, medidas, pais de origen).
 *   - Ofertas  -> PriceAndQuantity.xlsm: solo precio, stock, plazo y envio por SKU.
 *
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
 *     Plazo sin dato -> 2 dias.
 *   - Plantilla de envio: por modelo (AMAZON_ES_ENVIO).
 *   - Catalogo: peso, alto/ancho/fondo y pais de fabricacion del maestro.
 */
import { AMAZON_ES_ENVIO } from '../config/marketplaces';
import { stamp } from './excel';
import type { FilaMaestro, FilaOferta, Maestro } from './maestro';
import { modeloDeSku } from './makro';
import { Libro } from './xlsx';

const FILA_CAMPOS = 5;
const FILA_DATOS = 7;
const MERCADO = 'A1RKKUPIHCS9HS'; // Amazon.es
const PLAZO_POR_DEFECTO = 2;

export const PLANTILLAS_AMAZON_ES = {
  catalogo: 'plantillas/Amazon/ListingLoader_ES.xlsm',
  ofertas: 'plantillas/Amazon/PriceAndQuantity_ES.xlsm',
} as const;

export type ResultadoLoader = {
  nombre: string;
  blob: Blob;
  filas: number;
  avisos: string[];
};

export function generarAmazonEs(
  tipo: 'catalogo' | 'ofertas',
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
  const opcional = (nombre: string): number => {
    const exacta = campos.get(nombre);
    if (exacta) return exacta;
    for (const [k, c] of campos) if (k.startsWith(nombre)) return c;
    return 0;
  };
  const col = (nombre: string): number => {
    const c = opcional(nombre);
    if (!c) throw new Error(`La plantilla de Amazon no tiene el campo '${nombre}'.`);
    return c;
  };
  const oferta = `purchasable_offer[marketplace_id=${MERCADO}][audience=ALL]#1`;
  const C = {
    sku: col('contribution_sku#1.value'),
    canal: col('fulfillment_availability#1.fulfillment_channel_code'),
    cantidad: col('fulfillment_availability#1.quantity'),
    plazo: opcional('fulfillment_availability#1.lead_time_to_ship_max_days'),
    precio: col(`${oferta}.our_price#1.schedule#1.value`),
    envio: opcional(`merchant_shipping_group[marketplace_id=${MERCADO}]#1.value`),
    // solo en el ListingLoader (catalogo)
    accion: opcional('::record_action'),
    tipoId: opcional('externally_assigned_product_identifier#1.type'),
    id: opcional('externally_assigned_product_identifier#1.value'),
    asin: opcional('merchant_suggested_asin#1.value'),
    estado: opcional('condition_type#1.value'),
    peso: opcional('item_weight#1.value'),
    pesoUd: opcional('item_weight#1.unit'),
    largo: opcional('item_dimensions#1.length.value'),
    largoUd: opcional('item_dimensions#1.length.unit'),
    ancho: opcional('item_dimensions#1.width.value'),
    anchoUd: opcional('item_dimensions#1.width.unit'),
    alto: opcional('item_dimensions#1.height.value'),
    altoUd: opcional('item_dimensions#1.height.unit'),
    origen: opcional('country_of_origin#1.value'),
    baterias: opcional('batteries_required#1.value'),
  };
  if (tipo === 'catalogo' && !C.asin) {
    throw new Error('Esa no es la plantilla ListingLoader de Amazon (falta el campo del ASIN).');
  }

  // se parte de una hoja sin datos (por si la plantilla trae filas de otra vez)
  hoja.eliminarFilasDesde(FILA_DATOS);

  const sinSku: string[] = [];
  const sinDatos: string[] = [];
  const sinEnvio: string[] = [];
  let prestados = 0;
  let sinPlazo = 0;
  let r = FILA_DATOS;
  const set = (c: number, v: string | number | null) => {
    if (c && v !== null && v !== '') hoja.set(r, c, v);
  };

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

    set(C.sku, sku);
    if (tipo === 'catalogo') {
      set(C.accion, 'Crear o editar');
      set(C.tipoId, 'EAN');
      set(C.id, t(fila['ean']));
      set(C.asin, t(fila['amazon_asin_es']));
      set(C.estado, 'Nuevo');
      const peso = numero(fila['peso_kg']);
      if (peso !== null) {
        set(C.peso, peso);
        set(C.pesoUd, 'Kilogramos');
      }
      // largo = fondo (de delante a atras), ancho, alto: como en la ficha de Amazon
      for (const [c, cu, campo] of [
        [C.largo, C.largoUd, 'fondo_cm'],
        [C.ancho, C.anchoUd, 'ancho_cm'],
        [C.alto, C.altoUd, 'alto_cm'],
      ] as const) {
        const n = numero(fila[campo]);
        if (n !== null) {
          set(c, n);
          set(cu, 'Centímetros');
        }
      }
      set(C.origen, t(fila['pais_fabricacion']));
      set(C.baterias, 'No');
    }
    set(C.canal, 'Logística por parte del vendedor (predeterminado)');
    if (stock !== null) set(C.cantidad, Math.max(0, Math.round(stock)));
    let plazo = numero(o?.['PlazoEnvio']);
    if (plazo === null) {
      plazo = PLAZO_POR_DEFECTO;
      sinPlazo++;
    }
    set(C.plazo, plazo);
    if (precio !== null) set(C.precio, precio);
    const envio = AMAZON_ES_ENVIO[modeloDeSku(ref) ?? ''];
    if (envio) set(C.envio, envio);
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
  if (sinPlazo > 0) avisos.push(`${sinPlazo} sin plazo de envio en el maestro: se pone ${PLAZO_POR_DEFECTO} dias.`);
  if (sinEnvio.length > 0) {
    avisos.push(
      `${sinEnvio.length} sin plantilla de envio (modelo sin regla): ${sinEnvio.slice(0, 4).join(', ')}. ` +
        `Amazon mantiene la que ya tengan.`,
    );
  }

  const bytes = libro.guardar();
  return {
    nombre: `Amazon_ES_${tipo === 'catalogo' ? 'Catalogo' : 'Ofertas'}_${stamp()}.xlsm`,
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
