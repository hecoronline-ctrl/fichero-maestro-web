/**
 * Registro de marketplaces — port directo de _sistema/config/marketplaces.psd1
 *
 * Igual que en el sistema PowerShell: para ampliar NO se toca el motor, solo
 * este fichero. Cada item del Mapa define una columna destino:
 *   campo          = clave del maestro (token {IMG} -> idioma de imagen del portal)
 *   literal        = valor fijo (token {PAIS})
 *   desdePlantilla = conserva el valor que ya trae la plantilla
 *   etiqueta       = texto de la cabecera destino (contains, sin acentos)
 *   col            = indice de columna fijo (alternativa a etiqueta)
 */

export type MapaItem = {
  campo?: string;
  literal?: string;
  desdePlantilla?: boolean;
  etiqueta?: string;
  col?: number;
  texto?: boolean;
};

export type BloqueCfg = {
  paises?: string[];
  plantilla?: string;
  plantillasPais?: Record<string, string>;
  hoja: string;
  filaCabecera: number;
  filaDatos: number;
  modo?: 'Reemplazar' | 'Actualizar';
  clave?: string;
  skuCampo?: string;
  imgPais?: string;
  imgPaisPorPais?: Record<string, string>;
  soloEanDePlantilla?: boolean;
  quitarIvaPorPais?: Record<string, number>;
  descuentosCantidad?: Record<string, number>;
  shippingGroupPorModelo?: Record<string, string>;
  mapa: MapaItem[];
};

export type Marketplace = {
  id: string;
  nombre: string;
  familia: string;
  paises: string[];
  catalogo?: BloqueCfg;
  ofertas?: BloqueCfg;
  /** Flujo propio, no se genera desde el maestro (Makro). */
  flujoPropio?: boolean;
};

export const MARKETPLACES: Marketplace[] = [
  {
    id: 'LeroyMerlin',
    nombre: 'Leroy Merlin',
    familia: 'Mirakl',
    // Un fichero por idioma: titulos/descripciones de los 4 idiomas van en todos;
    // lo que cambia es el set de imagenes (un unico set por fichero).
    paises: ['ES', 'IT', 'FR', 'PT'],
    catalogo: {
      // Plantilla Mirakl i18n. Cabecera tecnica en la fila 2, datos desde la fila 3.
      plantilla: 'Leroy Merlin/products-Leroy-All.xlsx',
      hoja: 'Data',
      filaCabecera: 2,
      filaDatos: 3,
      modo: 'Reemplazar',
      // PT no tiene imagenes en el maestro -> se usan las de ingles (uk).
      imgPaisPorPais: { ES: 'es', IT: 'it', FR: 'fr', PT: 'uk' },
      mapa: [
        { desdePlantilla: true, etiqueta: 'product_category' },
        { campo: 'sku_leroy', etiqueta: 'shop_sku' },
        { campo: 'ean', etiqueta: 'gtin_EAN13' },
        { literal: 'TWINTHINK', etiqueta: 'feature_06575_brand' },
        { campo: 'titulo_fr', etiqueta: 'i18n_fr_12963_title' },
        { campo: 'titulo_it', etiqueta: 'i18n_it_12963_title' },
        { campo: 'titulo_es', etiqueta: 'i18n_es_12963_title' },
        { campo: 'titulo_pt', etiqueta: 'i18n_pt_12963_title' },
        { campo: 'descripcion_fr', etiqueta: 'i18n_fr_01022_longdescription' },
        { campo: 'descripcion_it', etiqueta: 'i18n_it_01022_longdescription' },
        { campo: 'descripcion_es', etiqueta: 'i18n_es_01022_longdescription' },
        { campo: 'descripcion_pt', etiqueta: 'i18n_pt_01022_longdescription' },
        { campo: 'img_{IMG}_1', etiqueta: 'media_1' },
        { campo: 'img_{IMG}_2', etiqueta: 'media_2' },
        { campo: 'img_{IMG}_3', etiqueta: 'media_3' },
        { campo: 'img_{IMG}_4', etiqueta: 'media_4' },
        { campo: 'img_{IMG}_5', etiqueta: 'media_5' },
        { campo: 'img_{IMG}_6', etiqueta: 'media_6' },
      ],
    },
    ofertas: {
      paises: ['ALL'], // un unico fichero de oferta para todos los paises
      plantilla: 'Leroy Merlin/offers-Leroy-All.xlsx',
      hoja: 'Data',
      filaCabecera: 1,
      filaDatos: 3,
      skuCampo: 'sku_leroy',
      mapa: [
        { campo: 'SKU', etiqueta: 'SKU de oferta' },
        { campo: 'EAN', etiqueta: 'ID de producto' },
        { literal: 'EAN', etiqueta: 'Tipo de ID de producto' },
        { campo: 'Precio', etiqueta: 'Precio de la oferta' },
        { campo: 'Stock', etiqueta: 'Cantidad de la oferta' },
        { campo: 'Estado', etiqueta: 'Estado de la oferta' },
        { campo: 'ClaseLogistica', etiqueta: 'Clase logistica' },
        { campo: 'PlazoEnvio', etiqueta: 'Plazo de envio' },
        { campo: 'Accion', etiqueta: 'Actualizar/Eliminar' },
        // Columnas constantes que la plantilla rellena en TODAS sus filas:
        //   57-60 = "Standard", 62 = "ES", 63 = "LMES,LMFR,LMIT,LMPT".
        // Por indice: las etiquetas de estas columnas son ambiguas/duplicadas.
        { desdePlantilla: true, col: 57 },
        { desdePlantilla: true, col: 58 },
        { desdePlantilla: true, col: 59 },
        { desdePlantilla: true, col: 60 },
        { desdePlantilla: true, col: 62 },
        { desdePlantilla: true, col: 63 },
      ],
    },
  },

  // Makro NO se genera desde el maestro: su plantilla offer_template {PAIS}.xlsx
  // YA trae los precios buenos. Solo se le aplican los CSV de precio y stock.
  // Ver src/engine/makro.ts.
  {
    id: 'Makro',
    nombre: 'Makro',
    familia: 'Makro',
    paises: ['ES', 'PT', 'IT', 'FR', 'DE', 'NL'],
    flujoPropio: true,
  },
];

export function getMarketplace(id: string): Marketplace | undefined {
  return MARKETPLACES.find((m) => m.id === id);
}

/** Paises validos para un tipo (el bloque puede tener los suyos propios). */
export function getPaises(mp: Marketplace, tipo: 'catalogo' | 'ofertas'): string[] {
  const bloque = mp[tipo];
  return bloque?.paises ?? mp.paises;
}

/**
 * Makro por pais de destino.
 *   vat        IVA del pais: Net price = precio con IVA del CSV / vat.
 *   precioPais valor de la columna `country` del CSV de precios que se usa.
 *   stockPais  valor de la columna `Pais` del CSV de stock = almacen desde el que se envia.
 *   origen     almacen de salida (ver MAKRO_ORIGENES).
 * Envios: Francia -> Francia, Alemania y Holanda; Espana -> Espana y Portugal; Italia -> Italia.
 */
export const MAKRO_PAIS_CFG: Record<
  string,
  { vat: number; precioPais: string; stockPais: string; origen: string }
> = {
  ES: { vat: 1.21, precioPais: 'ES', stockPais: 'ES/PT', origen: 'ES' },
  PT: { vat: 1.23, precioPais: 'ES', stockPais: 'ES/PT', origen: 'ES' },
  IT: { vat: 1.22, precioPais: 'IT', stockPais: 'Italia', origen: 'IT' },
  FR: { vat: 1.2, precioPais: 'FR', stockPais: 'Francia', origen: 'FR' },
  DE: { vat: 1.19, precioPais: 'DE', stockPais: 'Francia', origen: 'FR' },
  NL: { vat: 1.21, precioPais: 'NL', stockPais: 'Francia', origen: 'FR' },
};

/** Almacen de salida -> columna Origin y plazo de preparacion (dias). */
export const MAKRO_ORIGENES: Record<string, { origin: string; min: number; max: number }> = {
  ES: { origin: 'ES_MAIN', min: 2, max: 3 },
  IT: { origin: 'IT_MAIN', min: 2, max: 3 },
  FR: { origin: 'FR_MAIN', min: 1, max: 2 },
};

/** Shipping Group: norma fija por modelo (las plantillas traian errores). */
export const MAKRO_SHIPPING: Record<string, string> = {
  '001': 'SMALL',
  '003': 'LARGE',
  '007': 'MEDIUM',
  '010': 'MEDIUM',
  '011': 'LARGE',
};

/**
 * Amazon ES: plantilla de envio por modelo (nombres exactos de la cuenta, tal y como
 * salen en el desplegable del ListingLoader). El 003 no aparece en ninguna.
 */
export const AMAZON_ES_ENVIO: Record<string, string> = {
  '001': 'Nannuk S (001-006-022)',
  '007': 'Nannuk M (007-010)',
  '010': 'Nannuk M (007-010)',
  '011': 'Nannuk L (011)',
};

/** Descuentos por cantidad sobre el neto: 2+ -3%, 3+ -4%, 4+ -5%, 5+ -6%. */
export const MAKRO_DESCUENTOS: { etiqueta: string; f: number }[] = [
  { etiqueta: 'Net Unit Price for 2+ pcs', f: 0.97 },
  { etiqueta: 'Net Unit Price for 3+ pcs', f: 0.96 },
  { etiqueta: 'Net Unit Price for 4+ pcs', f: 0.95 },
  { etiqueta: 'Net Unit Price for 5+ pcs', f: 0.94 },
];
