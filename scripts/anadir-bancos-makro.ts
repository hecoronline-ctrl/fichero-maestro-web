/**
 * Mete los bancos (B.MET.090 y B.MET.150) en las plantillas de oferta de Makro de la web.
 * Uso: npx tsx scripts/anadir-bancos-makro.ts
 * Fuentes: las ofertas por pais generadas en el escritorio (Marketplaces\Bancos y Bancos_150).
 * Solo anade los GTIN que falten; lo que ya esta en la plantilla no se toca.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { anadirFilasQueFaltan } from '../src/engine/makro';

const ESC = 'C:/Users/Helian/Desktop';
const fuentes = (p: string) => [
  `${ESC}/Marketplaces/Bancos/Makro/offer_template_makro_bancos_${p}.xlsx`,
  `${ESC}/Bancos_150/Makro/offer_template_makro_bancos150_${p}.xlsx`,
];

for (const p of ['ES', 'PT', 'IT', 'FR', 'DE', 'NL']) {
  const destino = `public/plantillas/Makro/offer_template ${p}.xlsx`;
  let bytes: Uint8Array = readFileSync(destino);
  const total: string[] = [];
  for (const f of fuentes(p)) {
    const r = anadirFilasQueFaltan(bytes, readFileSync(f));
    bytes = r.bytes;
    total.push(...r.anadidas);
  }
  writeFileSync(destino, bytes);
  console.log(`${p}: ${total.length} filas nuevas (${total.join(', ')})`);
}
