/**
 * Genera los ficheros de Amazon ES (catalogo = ListingLoader, ofertas = PriceAndQuantity)
 * con el maestro incluido y los guarda.
 *
 *   npx tsx scripts/probar-amazon-es.ts <salida.xlsm> [--sku-prueba] [catalogo|ofertas]
 *
 * --sku-prueba rellena amazon_sku_es con "PRUEBA_<sku_canonico>" solo en memoria,
 * para ver el fichero con filas mientras el maestro no trae los SKU de Amazon ES.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PLANTILLAS_AMAZON_ES, generarAmazonEs } from '../src/engine/amazonLoader';
import { readMaestro } from '../src/engine/maestro';

const PUBLIC = join(resolve(import.meta.dirname, '..'), 'public');
const [salida, flag, tipoArg] = process.argv.slice(2);
const tipo = (tipoArg ?? (flag && flag !== '--sku-prueba' ? flag : 'ofertas')) as 'catalogo' | 'ofertas';
if (!salida) {
  console.error('Uso: npx tsx scripts/probar-amazon-es.ts <salida.xlsm> [--sku-prueba]');
  process.exit(1);
}

async function main() {
  const maestro = readMaestro(new Uint8Array(readFileSync(join(PUBLIC, 'datos', 'FICHERO_MAESTRO2.xlsx'))));
  if (flag === '--sku-prueba') {
    for (const f of maestro.catalogo) f['amazon_sku_es'] = `PRUEBA_${f['sku_canonico']}`;
  }
  const plantilla = new Uint8Array(readFileSync(join(PUBLIC, PLANTILLAS_AMAZON_ES[tipo])));
  const r = generarAmazonEs(tipo, plantilla, maestro);
  console.log(`${r.filas} filas`);
  for (const a of r.avisos) console.log(`  aviso: ${a}`);
  writeFileSync(salida, new Uint8Array(await r.blob.arrayBuffer()));
}

main();
