/**
 * Makro — fichas de producto (multi_template). Todo lo que es norma de Makro vive
 * aqui; el motor (engine/makroFichas.ts) no sabe nada de paises ni de textos.
 *
 * Reglas aprendidas de los rechazos de Makro:
 *   ErrorPV0602  Product name > 150 caracteres.
 *   ErrorIM02    enlaces de Google Drive (en cualquier columna, p. ej. el manual).
 *   ERROR-0097   GPSR: "Product safety instructions" obligatorio.
 *   ErrorPD02    contacto / redes sociales / postventa en la descripcion.
 *   ErrorKF01    key features que repiten la descripcion (se usan las ya aceptadas).
 *   ErrorPV0503  categoria de taquillas distinta de la ...f0.
 */

export type IdiomaFicha = {
  /** Sufijo de las columnas de la plantilla: "Product name ES", "Key feature ES"... */
  codigo: string;
  /** Idioma de los textos del maestro (titulo_xx...). null = el maestro no lo tiene (NL). */
  maestro: string | null;
  seguridad: string;
  componentes: string;
};

export type FicheroFichas = {
  /** Nombre del fichero: multi_template {fichero}.xlsx */
  fichero: string;
  /** Valor de "Target markets". */
  mercados: string;
  idiomas: IdiomaFicha[];
  /** Bloque de imagenes del maestro (img_xx_n). */
  imagenes: string;
};

const ES: IdiomaFicha = {
  codigo: 'ES',
  maestro: 'es',
  seguridad:
    'No se aplican advertencias de seguridad específicas cuando el producto se utiliza según lo previsto.',
  componentes: 'instrucciones de montaje',
};
const IT: IdiomaFicha = {
  codigo: 'IT',
  maestro: 'it',
  seguridad:
    'Non si applicano avvertenze di sicurezza specifiche quando il prodotto è utilizzato come previsto.',
  componentes: 'istruzioni di montaggio',
};
const FR: IdiomaFicha = {
  codigo: 'FR',
  maestro: 'fr',
  seguridad:
    "Aucun avertissement de sécurité spécifique ne s'applique lorsque le produit est utilisé conformément à l'usage prévu.",
  componentes: 'instructions de montage',
};
const DE: IdiomaFicha = {
  codigo: 'DE',
  maestro: 'de',
  seguridad:
    'Bei bestimmungsgemäßer Verwendung des Produkts gelten keine besonderen Sicherheitshinweise.',
  componentes: 'Montageanleitung',
};
const PT: IdiomaFicha = {
  codigo: 'PT',
  maestro: 'pt',
  seguridad:
    'Não se aplicam avisos de segurança específicos quando o produto é utilizado conforme previsto.',
  componentes: 'instruções de montagem',
};
const NL: IdiomaFicha = {
  codigo: 'NL',
  maestro: null,
  seguridad:
    'Er zijn geen specifieke veiligheidswaarschuwingen van toepassing wanneer het product wordt gebruikt zoals bedoeld.',
  componentes: 'montage-instructies',
};

/** PT y NL van en UN SOLO fichero, con las imagenes en ingles. */
export const MAKRO_FICHAS: FicheroFichas[] = [
  { fichero: 'ES', mercados: 'ES', idiomas: [ES], imagenes: 'es' },
  { fichero: 'IT', mercados: 'IT', idiomas: [IT], imagenes: 'it' },
  { fichero: 'FR', mercados: 'FR', idiomas: [FR], imagenes: 'fr' },
  { fichero: 'DE', mercados: 'DE', idiomas: [DE], imagenes: 'de' },
  { fichero: 'NL_PT', mercados: 'PT,NL', idiomas: [PT, NL], imagenes: 'uk' },
];

export const MAKRO_FICHAS_MARCA = 'TwinThink';

/** Categoria por tipo de producto (tipo del maestro). */
export const MAKRO_FICHAS_CATEGORIA: Record<string, { id: string; nombre: string }> = {
  MET: { id: 'dda37f43-8bdd-43ad-9fa4-79461e69571e', nombre: 'Bancos para vestidor' },
  '*': { id: 'f08b9fab-b6b0-40b7-bd95-e36dc73881f0', nombre: 'Taquillas' },
};

/**
 * Color del maestro -> LOV de Makro (en espanol en TODOS los paises, 19 valores).
 * No hay bicolor: blanco/negro -> blanco. Efecto madera -> marron, antracita -> gris.
 */
export const MAKRO_FICHAS_COLOR: Record<string, string> = {
  G: 'gris',
  N: 'negro',
  B: 'blanco',
  'B-N': 'blanco',
  M: 'marrón',
  A: 'gris',
};

export const MAKRO_MAX_NOMBRE = 150;

/** Relleno que se quita del nombre cuando pasa de 150 caracteres. */
export const MAKRO_RELLENO_NOMBRE = [
  ' di alta qualità',
  ' de alta calidad',
  ' de haute qualité',
  ' de alta qualidade',
  ' hochwertige',
  ' hochwertig',
];

/** Parrafos de la descripcion que Makro rechaza (contacto, redes, postventa). */
export const MAKRO_PARRAFO_PROHIBIDO =
  /postvent|pós-venda|pos-venda|après-vente|apres-vente|post-vendita|kundendienst|kundenservice|klantenservice|redes sociales|redes sociais|réseaux sociaux|canali social|sociale media|contáct|contact|kontakt|whatsapp|https?:\/\/|www\.|@/i;

/**
 * Claves unicas para las cabeceras de la plantilla: las repetidas (Image, Key
 * feature XX) se numeran "Image#1".."Image#5". Sirve para leer y para escribir.
 */
export function claveCabeceras(
  texto: (c: number) => string,
  nCols: number,
): Map<string, number> {
  const total = new Map<string, number>();
  for (let c = 1; c <= nCols; c++) {
    const t = texto(c);
    if (t) total.set(t, (total.get(t) ?? 0) + 1);
  }
  const visto = new Map<string, number>();
  const out = new Map<string, number>();
  for (let c = 1; c <= nCols; c++) {
    const t = texto(c);
    if (!t) continue;
    const i = (visto.get(t) ?? 0) + 1;
    visto.set(t, i);
    out.set(total.get(t)! > 1 ? `${t}#${i}` : t, c);
  }
  return out;
}
