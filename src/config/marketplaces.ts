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
 *   valores        = traduce el valor del maestro al del portal (p. ej. G -> "Gris / plata")
 */

export type MapaItem = {
  campo?: string;
  literal?: string;
  desdePlantilla?: boolean;
  etiqueta?: string;
  col?: number;
  texto?: boolean;
  valores?: Record<string, string>;
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
  /** Ofertas: precio por canal/pais (campos PrecioReal_{canal} y PrecioTachado_{canal}). */
  canales?: { canal: string; pais: string; precioDe?: string; rebaja?: number }[];
  /**
   * Ofertas: reglas de precio a elegir al generar (la primera es la predeterminada).
   * sinRebaja = ignora la rebaja de los canales; claseLogistica = valor fijo para todas.
   */
  reglasPrecio?: {
    id: string;
    nombre: string;
    sinRebaja?: boolean;
    claseLogistica?: string;
    /** Desactivada: no se ofrece ni se aplica (se conserva para reactivarla). */
    inactiva?: boolean;
  }[];
  /** Ofertas: deja vacio el discount-price general (solo cuentan los de canal). */
  sinDescuentoGeneral?: boolean;
  /** Ofertas: pais cuyo precio se usa en un canal sin precio propio (si no, canal vacio). */
  canalSinPrecio?: string;
  /** Ofertas: price general = el precio de pais mas caro de los canales (sin rebaja). */
  tachadoGeneralMaxPais?: boolean;
  /** Ofertas: portales de la hoja Ofertas de los que sale el precio de cada pais. */
  preciosPaisDesde?: string[];
  /** Ofertas: precio tachado = precio real + esto (campos PrecioReal / PrecioTachado). */
  tachadoMas?: number;
  /** Catalogo: solo los productos de estos tipos del maestro (columna `tipo`). */
  soloTipos?: string[];
  /** Catalogo: todos los productos menos los de estos tipos. */
  excluirTipos?: string[];
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
      // La plantilla es de taquillas (categoria "Armario metalico"): los bancos
      // van en su propio portal, "Leroy Merlin · Bancos".
      excluirTipos: ['MET'],
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
      // Un unico fichero de ofertas para los 4 paises (plantilla Mirakl de 97 columnas
      // descargada de Leroy el 28/09/2026). Cabecera por CODIGO (fila 2), datos desde la 3.
      paises: ['ALL'],
      plantilla: 'Leroy Merlin/offers-Leroy-All.xlsx',
      hoja: 'Data',
      filaCabecera: 2,
      filaDatos: 3,
      skuCampo: 'sku_leroy',
      // "Regla Leroy de precios nº1" (asi la llama el usuario, 30/09/2026).
      // Canales de Leroy:
      //   001 = Francia, 002 = Espana, 003 = Portugal, 005 = Italia.
      // discount-price de cada canal = precio que queremos en ese pais (filas LeroyMerlin
      // ALL/FR/IT de la hoja Ofertas, las actualiza el CSV). Portugal lleva el de Espana,
      // y un pais sin precio propio tambien (ningun canal queda vacio).
      canales: [
        { canal: '001', pais: 'FR', rebaja: 40 },
        { canal: '002', pais: 'ES', rebaja: 30 },
        { canal: '003', pais: 'PT', precioDe: 'ES', rebaja: 30 },
        { canal: '005', pais: 'IT', rebaja: 40 },
      ],
      // discount-price de canal = precio del pais - rebaja (FR/IT 40, ES/PT 30; 30/09/2026).
      // El discount-price general va vacio.
      sinDescuentoGeneral: true,
      preciosPaisDesde: ['LeroyMerlin'],
      canalSinPrecio: 'ES',
      // price de cada canal (tachado) = su discount-price + 30 EUR.
      tachadoMas: 30,
      // price general (obligatorio) = el precio de pais mas caro, sin rebaja (30/09/2026).
      tachadoGeneralMaxPais: true,
      reglasPrecio: [
        // Desactivada el 30/09/2026 a peticion del usuario (volvera mas adelante):
        // para reactivarla, quitar `inactiva`.
        { id: '1', nombre: 'Regla nº1 (con rebaja)', inactiva: true },
        // Regla nº2 (30/09/2026): la nº1 sin rebaja (descuento = precio del pais) y
        // con envio gratuito (clase logistica "Envío gratuito" de la lista de Leroy).
        { id: '2', nombre: 'Regla nº2 (sin rebaja, envío gratis)', sinRebaja: true, claseLogistica: 'Envío gratuito' },
      ],
      mapa: [
        { campo: 'SKU', etiqueta: 'sku' },
        { campo: 'EAN', etiqueta: 'product-id' },
        { literal: 'EAN', etiqueta: 'product-id-type' },
        { campo: 'PrecioTachado', etiqueta: 'price' },
        { campo: 'PrecioReal', etiqueta: 'discount-price' },
        { campo: 'Stock', etiqueta: 'quantity' },
        { campo: 'Estado', etiqueta: 'state' },
        { campo: 'ClaseLogistica', etiqueta: 'logistic-class' },
        { campo: 'PlazoEnvio', etiqueta: 'leadtime-to-ship' },
        { campo: 'Accion', etiqueta: 'update-delete' },
        { campo: 'PrecioTachado_001', etiqueta: 'price[channel=001]' },
        { campo: 'PrecioReal_001', etiqueta: 'discount-price[channel=001]' },
        { campo: 'PrecioTachado_002', etiqueta: 'price[channel=002]' },
        { campo: 'PrecioReal_002', etiqueta: 'discount-price[channel=002]' },
        { campo: 'PrecioTachado_003', etiqueta: 'price[channel=003]' },
        { campo: 'PrecioReal_003', etiqueta: 'discount-price[channel=003]' },
        { campo: 'PrecioTachado_005', etiqueta: 'price[channel=005]' },
        { campo: 'PrecioReal_005', etiqueta: 'discount-price[channel=005]' },
        { literal: 'Standard', etiqueta: 'vat-lmfr' },
        { literal: 'Standard', etiqueta: 'vat-lmit' },
        { literal: 'Standard', etiqueta: 'vat-lmes' },
        { literal: 'Standard', etiqueta: 'vat-lmpt' },
        { literal: 'ES', etiqueta: 'shipment-origin' },
        { literal: 'LMES,LMFR,LMIT,LMPT', etiqueta: 'exclusive-channels' },
      ],
    },
  },

  // Bancos metalicos (tipo MET) en Leroy: otra categoria ("Banco de interior") con
  // sus propios atributos, asi que van en otra plantilla (exportada de Leroy).
  // Las ofertas de los bancos salen en el fichero de ofertas de Leroy Merlin.
  {
    id: 'LeroyMerlinBancos',
    nombre: 'Leroy Merlin · Bancos',
    familia: 'Mirakl',
    paises: ['ES', 'IT', 'FR', 'PT'],
    catalogo: {
      plantilla: 'Leroy Merlin/products-Leroy-Bancos.xlsx',
      hoja: 'Data',
      filaCabecera: 2,
      filaDatos: 3,
      modo: 'Reemplazar',
      imgPaisPorPais: { ES: 'es', IT: 'it', FR: 'fr', PT: 'uk' },
      soloTipos: ['MET'],
      mapa: [
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
        {
          campo: 'color',
          etiqueta: 'feature_10837_main_color',
          valores: { G: 'Gris / plata', N: 'Negro', B: 'Blanco', 'B-N': 'Multicolor' },
        },
        { campo: 'peso_kg', etiqueta: 'ATT_00124' },
        { campo: 'alto_cm', etiqueta: 'ATT_00054' },
        { campo: 'ancho_cm', etiqueta: 'ATT_00053' },
        { campo: 'fondo_cm', etiqueta: 'ATT_00055' },
        // Plazas: el de 90 cm es de 2 y el de 150 cm de 3.
        { campo: 'ancho_cm', etiqueta: 'feature_13840_', valores: { '90': '2', '150': '3' } },
        // Lo comun a todos los bancos, tal y como esta en el fichero exportado de Leroy.
        { desdePlantilla: true, etiqueta: 'product_category' },
        { desdePlantilla: true, etiqueta: 'parentproductid' },
        { desdePlantilla: true, etiqueta: 'feature_10840_main_material' },
        { desdePlantilla: true, etiqueta: 'feature_22088_' },
        { desdePlantilla: true, etiqueta: 'feature_21268_' },
        { desdePlantilla: true, etiqueta: 'feature_10844_' },
        { desdePlantilla: true, etiqueta: 'ATT_01305' },
        { desdePlantilla: true, etiqueta: 'ATT_09309' },
        { desdePlantilla: true, etiqueta: 'feature_13558_' },
        { desdePlantilla: true, etiqueta: 'feature_08175_' },
        { desdePlantilla: true, etiqueta: 'feature_02419_' },
        { desdePlantilla: true, etiqueta: 'ATT_21148' },
        { desdePlantilla: true, etiqueta: 'ATT_20644' },
        { desdePlantilla: true, etiqueta: 'feature_00277_' },
        { desdePlantilla: true, etiqueta: 'feature_26156_' },
        { desdePlantilla: true, etiqueta: 'feature_25415_' },
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
