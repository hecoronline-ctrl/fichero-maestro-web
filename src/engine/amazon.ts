/**
 * Amazon — BETA. Flat file (.txt tabulado) de catalogo y de precio/stock.
 *
 * AVISO: esto todavia NO esta validado contra Seller Central. Se genera con la
 * forma de un flat file de Amazon (3 filas de cabecera + datos) y con nombres de
 * campo reales, pero la plantilla buena es la .xlsm que Amazon da por categoria
 * y aun no la tenemos. Lo que falta para cerrarlo:
 *   1. Un flat file de ejemplo descargado de Seller Central ES / IT / PT, para
 *      copiar el TemplateType, la version y el orden exacto de columnas.
 *   2. Los SKU y ASIN de ES, IT y PT: el maestro solo trae amazon_sku_de/fr/uk.
 *      Mientras tanto el SKU de esos paises se DEDUCE (sku_canonico + _PAIS),
 *      copiando el patron que ya usa Alemania (R.EMD.001_G_DE).
 *   3. Filas de Amazon en la hoja Ofertas: ahora mismo hay 0, asi que el precio
 *      sale de otro portal como referencia y se avisa.
 *
 * Se eligio .txt y no .xlsm a proposito: sin macros, sin 2 MB por plantilla y
 * sin depender de una libreria de Excel. Seller Central acepta el .txt tabulado
 * en "Cargar archivos de inventario".
 */
import type { FilaMaestro, FilaOferta, Maestro } from './maestro';

export const PAISES_AMAZON = ['ES', 'PT', 'IT', 'FR', 'UK', 'DE'];

/** Por pais: idioma de los textos, set de imagenes y moneda. */
const CFG: Record<string, { lang: string; img: string; moneda: string }> = {
  ES: { lang: 'es', img: 'es', moneda: 'EUR' },
  PT: { lang: 'pt', img: 'uk', moneda: 'EUR' }, // PT no tiene imagenes propias en el maestro
  IT: { lang: 'it', img: 'it', moneda: 'EUR' },
  FR: { lang: 'fr', img: 'fr', moneda: 'EUR' },
  UK: { lang: 'en', img: 'uk', moneda: 'GBP' },
  DE: { lang: 'de', img: 'de', moneda: 'EUR' },
};

/** Tipo de producto de la categoria. Provisional hasta ver la plantilla real. */
const PRODUCT_TYPE = 'cabinet';

type Columna = {
  campo: string; // nombre tecnico, el que lee Amazon
  titulo: string; // nombre visible, la fila que ve el humano
  valor: (ctx: Ctx) => string;
};

type Ctx = {
  fila: FilaMaestro;
  pais: string;
  lang: string;
  img: string;
  sku: string;
  oferta: FilaOferta | null;
};

// ------------------------------------------------------------- catalogo

const CATALOGO: Columna[] = [
  { campo: 'feed_product_type', titulo: 'Tipo de producto', valor: () => PRODUCT_TYPE },
  { campo: 'item_sku', titulo: 'SKU del vendedor', valor: (c) => c.sku },
  { campo: 'external_product_id', titulo: 'ID de producto', valor: (c) => t(c.fila['ean']) },
  { campo: 'external_product_id_type', titulo: 'Tipo de ID', valor: () => 'EAN' },
  { campo: 'brand_name', titulo: 'Marca', valor: (c) => t(c.fila['marca']) },
  { campo: 'manufacturer', titulo: 'Fabricante', valor: (c) => t(c.fila['marca']) },
  { campo: 'part_number', titulo: 'Numero de pieza', valor: (c) => t(c.fila['sku_canonico']) },
  { campo: 'item_name', titulo: 'Titulo', valor: (c) => texto(c, 'titulo') },
  { campo: 'product_description', titulo: 'Descripcion', valor: (c) => texto(c, 'descripcion') },
  ...bullets(),
  { campo: 'generic_keywords', titulo: 'Palabras clave', valor: (c) => texto(c, 'keywords') },
  { campo: 'main_image_url', titulo: 'Imagen principal', valor: (c) => imagen(c, 1) },
  ...imagenesExtra(),
  { campo: 'condition_type', titulo: 'Estado', valor: () => 'New' },
  { campo: 'color_name', titulo: 'Color', valor: (c) => t(c.fila['color_nombre']) },
  { campo: 'material_type', titulo: 'Material', valor: (c) => t(c.fila['material']) },
  { campo: 'finish_type', titulo: 'Acabado', valor: (c) => t(c.fila['acabado']) },
  { campo: 'shape', titulo: 'Forma', valor: (c) => t(c.fila['forma']) },
  { campo: 'style_name', titulo: 'Estilo', valor: (c) => t(c.fila['estilo']) },
  { campo: 'number_of_doors', titulo: 'Numero de puertas', valor: (c) => t(c.fila['num_puertas']) },
  { campo: 'lock_type', titulo: 'Cierre', valor: (c) => t(c.fila['cierre']) },
  { campo: 'included_components', titulo: 'Incluye', valor: (c) => t(c.fila['incluye']) },
  { campo: 'country_of_origin', titulo: 'Pais de origen', valor: (c) => t(c.fila['pais_fabricacion']) },
  { campo: 'item_display_height', titulo: 'Alto', valor: (c) => t(c.fila['alto_cm']) },
  { campo: 'item_display_height_unit_of_measure', titulo: 'Unidad alto', valor: () => 'centimeters' },
  { campo: 'item_display_width', titulo: 'Ancho', valor: (c) => t(c.fila['ancho_cm']) },
  { campo: 'item_display_width_unit_of_measure', titulo: 'Unidad ancho', valor: () => 'centimeters' },
  { campo: 'item_display_length', titulo: 'Fondo', valor: (c) => t(c.fila['fondo_cm']) },
  { campo: 'item_display_length_unit_of_measure', titulo: 'Unidad fondo', valor: () => 'centimeters' },
  { campo: 'item_weight', titulo: 'Peso', valor: (c) => t(c.fila['peso_kg']) },
  { campo: 'item_weight_unit_of_measure', titulo: 'Unidad peso', valor: () => 'kilograms' },
  { campo: 'standard_price', titulo: 'Precio', valor: (c) => (c.oferta ? t(c.oferta['Precio']) : '') },
  { campo: 'quantity', titulo: 'Existencias', valor: (c) => (c.oferta ? t(c.oferta['Stock']) : '') },
  { campo: 'update_delete', titulo: 'Accion', valor: () => 'Update' },
];

// -------------------------------------------------------------- ofertas

const OFERTAS: Columna[] = [
  { campo: 'sku', titulo: 'SKU del vendedor', valor: (c) => c.sku },
  { campo: 'asin', titulo: 'ASIN', valor: (c) => t(c.fila[`amazon_asin_${c.pais.toLowerCase()}`]) },
  { campo: 'price', titulo: 'Precio', valor: (c) => (c.oferta ? t(c.oferta['Precio']) : '') },
  { campo: 'quantity', titulo: 'Existencias', valor: (c) => (c.oferta ? t(c.oferta['Stock']) : '') },
  {
    campo: 'leadtime-to-ship',
    titulo: 'Plazo de envio',
    valor: (c) => (c.oferta ? t(c.oferta['PlazoEnvio']) : ''),
  },
  { campo: 'item-condition', titulo: 'Estado', valor: () => '11' }, // 11 = Nuevo
  { campo: 'add-delete', titulo: 'Anadir/Borrar', valor: () => 'a' },
];

// ------------------------------------------------------------ generador

export type ResultadoAmazon = {
  nombre: string;
  blob: Blob;
  filas: number;
  avisos: string[];
};

export function generarAmazon(
  tipo: 'catalogo' | 'ofertas',
  pais: string,
  maestro: Maestro,
): ResultadoAmazon {
  const cfg = CFG[pais];
  if (!cfg) throw new Error(`Pais no contemplado en Amazon: ${pais}`);

  const columnas = tipo === 'catalogo' ? CATALOGO : OFERTAS;
  const avisos: string[] = [];
  const deducidos: string[] = [];
  const sinTexto: string[] = [];
  const sinBullets: string[] = [];
  let sinPrecioPropio = 0;

  const lineas: string[][] = [];
  for (const fila of maestro.catalogo) {
    const ref = t(fila['sku_canonico']);
    const propio = t(fila[`amazon_sku_${pais.toLowerCase()}`]);
    const sku = propio || `${ref}_${pais}`;
    if (!propio && ref !== '') deducidos.push(sku);

    const { oferta, prestado } = buscarOferta(maestro.ofertas, fila, pais);
    if (prestado) sinPrecioPropio++;

    if (t(fila[`titulo_${cfg.lang}`]) === '') sinTexto.push(ref);
    if (tipo === 'catalogo' && t(fila[`bullets_${cfg.lang}`]) === '') sinBullets.push(ref);

    const ctx: Ctx = { fila, pais, lang: cfg.lang, img: cfg.img, sku, oferta };
    lineas.push(columnas.map((col) => limpiar(col.valor(ctx))));
  }

  if (deducidos.length > 0) {
    avisos.push(
      `${deducidos.length} SKU deducidos (el maestro no trae amazon_sku_${pais.toLowerCase()}): ` +
        `p.ej. ${deducidos[0]}. Hay que confirmarlos en Seller Central.`,
    );
  }
  if (sinTexto.length > 0) {
    avisos.push(
      `${sinTexto.length} referencias sin texto en ${cfg.lang.toUpperCase()}: se usa el ingles o el espanol.`,
    );
  }
  if (sinBullets.length > 0) {
    avisos.push(
      `${sinBullets.length} referencias sin bullets en ${cfg.lang.toUpperCase()}: van los ingleses. ` +
        `Los bullets son lo que mas vende en Amazon, conviene escribirlos en el maestro.`,
    );
  }
  if (sinPrecioPropio > 0) {
    avisos.push(
      `${sinPrecioPropio} precios prestados de otro portal: la hoja Ofertas no tiene filas de Amazon.`,
    );
  }
  if (pais === 'PT') avisos.push('PT no tiene imagenes propias en el maestro: se usan las de UK.');
  if (pais === 'UK') avisos.push('UK: el precio va tal cual, en euros. No se convierte a GBP.');

  const cab1 = [
    `TemplateType=fptcustom`,
    `Version=BETA`,
    `Pais=${pais}`,
    `Moneda=${cfg.moneda}`,
    `Generado=${new Date().toISOString().slice(0, 10)}`,
    `AVISO: plantilla no validada contra Seller Central`,
  ];
  const filas = [
    cab1,
    columnas.map((c) => c.titulo),
    columnas.map((c) => c.campo),
    ...lineas,
  ];

  // BOM para que Excel abra bien los acentos si lo revisa antes de subirlo.
  const texto = '﻿' + filas.map((f) => f.join('\t')).join('\r\n') + '\r\n';
  const sufijo = tipo === 'catalogo' ? 'Catalogo' : 'PrecioStock';
  return {
    nombre: `Amazon_${pais}_${sufijo}_BETA.txt`,
    blob: new Blob([texto], { type: 'text/tab-separated-values;charset=utf-8' }),
    filas: lineas.length,
    avisos,
  };
}

// ----------------------------------------------------------- utilidades

/**
 * Precio y stock de la referencia. Se busca primero una fila de Amazon del pais;
 * si no hay (hoy no hay ninguna) se toma cualquier otra fila de esa referencia
 * como referencia provisional y se marca como prestada.
 */
function buscarOferta(
  ofertas: FilaOferta[],
  fila: FilaMaestro,
  pais: string,
): { oferta: FilaOferta | null; prestado: boolean } {
  const ean = t(fila['ean']);
  const ref = t(fila['sku_canonico']);
  const suyas = ofertas.filter((o) => t(o['EAN']) === ean || (ref !== '' && t(o['ref']) === ref));

  const amazon = suyas.filter((o) => t(o['Marketplace']).toLowerCase() === 'amazon');
  const exacta = amazon.find((o) => t(o['Pais']) === pais || t(o['Pais']) === 'ALL');
  if (exacta) return { oferta: exacta, prestado: false };
  if (amazon.length > 0) return { oferta: amazon[0], prestado: false };

  return { oferta: suyas[0] ?? null, prestado: suyas.length > 0 };
}

/** Texto del idioma del pais; si falta, ingles, y si tampoco, espanol. */
function texto(c: Ctx, campo: string): string {
  for (const lang of [c.lang, 'en', 'es']) {
    const v = t(c.fila[`${campo}_${lang}`]);
    if (v !== '') return v;
  }
  return '';
}

function imagen(c: Ctx, n: number): string {
  return t(c.fila[`img_${c.img}_${n}`]);
}

function bullets(): Columna[] {
  return [1, 2, 3, 4, 5].map((n) => ({
    campo: `bullet_point${n}`,
    titulo: `Bullet ${n}`,
    valor: (c: Ctx) => {
      const bruto = texto(c, 'bullets');
      const partes = bruto
        .split(/\r?\n/)
        .map((s) => s.replace(/^[•\-•]\s*/, '').trim())
        .filter((s) => s !== '');
      return partes[n - 1] ?? '';
    },
  }));
}

function imagenesExtra(): Columna[] {
  return [2, 3, 4, 5, 6].map((n) => ({
    campo: `other_image_url${n - 1}`,
    titulo: `Imagen ${n}`,
    valor: (c: Ctx) => imagen(c, n),
  }));
}

/** Una celda de un .txt tabulado no puede llevar tabuladores ni saltos de linea. */
function limpiar(v: string): string {
  return v.replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ').trim();
}

function t(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}
