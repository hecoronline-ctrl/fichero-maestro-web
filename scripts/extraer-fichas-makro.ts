/**
 * Prepara lo que necesita el generador de fichas de producto de Makro:
 *
 *  1. public/plantillas/Makro/multi_template {ES,IT,FR,DE,NL_PT}.xlsx
 *     = las plantillas de Makro de cada pais SIN filas de datos (cabecera hasta la fila 7).
 *  2. public/datos/makro_fichas.json
 *     = lo ya enviado a Makro, por fichero y GTIN. Guarda lo que el maestro no tiene:
 *       key features aceptadas, textos NL, medidas de embalaje, categoria, imagen
 *       principal limpia (sin sello de pais)...
 *
 * Uso: npx tsx scripts/extraer-fichas-makro.ts
 * Volver a ejecutarlo cuando se envien a Makro fichas nuevas o corregidas.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { Libro } from '../src/engine/xlsx';
import type { Valor } from '../src/engine/xlsx';
import { MAKRO_FICHAS, claveCabeceras } from '../src/config/makroFichas';

const D = homedir() + '/Desktop/';
const HOJA = 'Products Template';

// Orden de lectura: lo posterior pisa a lo anterior (las correcciones van al final).
const fuentes = (f: string) => [
  `Marketplaces/Makro/multi_template_${f}.xlsx`,
  f === 'ES'
    ? 'Marketplaces/Bancos/Makro/multi_template.xlsx'
    : `Marketplaces/Bancos/Makro/multi_template_bancos90_${f}.xlsx`,
  `Bancos_150/Makro/multi_template_${f}_bancos150.xlsx`,
  `multi_template_${f}_New.xlsx`,
];

const fichas: Record<string, Record<string, Valor>> = {};

for (const cfg of MAKRO_FICHAS) {
  // 1. plantilla vacia a partir del original del pais
  const libro = Libro.abrir(readFileSync(D + fuentes(cfg.fichero)[0]));
  libro.hoja(HOJA).eliminarFilasDesde(8);
  const salida = `public/plantillas/Makro/multi_template ${cfg.fichero}.xlsx`;
  writeFileSync(salida, libro.guardar());
  console.log('plantilla ->', salida);

  // 2. fichas ya enviadas
  for (const rel of fuentes(cfg.fichero)) {
    if (!existsSync(D + rel)) {
      console.log('   (no existe)', rel);
      continue;
    }
    const h = Libro.abrir(readFileSync(D + rel)).hoja(HOJA);
    const cab = claveCabeceras((c) => h.texto(7, c), h.ultimaColumna);
    const cGtin = cab.get('GTIN');
    if (!cGtin) throw new Error(`${rel}: sin columna GTIN`);
    let n = 0;
    for (let r = 8; r <= h.ultimaFila; r++) {
      const g = h.texto(r, cGtin);
      if (!g) continue;
      const fila: Record<string, Valor> = {};
      for (const [k, c] of cab) {
        const v = h.get(r, c);
        if (v !== null && v !== '') fila[k] = v;
      }
      fichas[`${cfg.fichero}|${g}`] = fila;
      n++;
    }
    console.log(`   ${rel}: ${n} filas`);
  }
}

writeFileSync('public/datos/makro_fichas.json', JSON.stringify(fichas));
console.log(`makro_fichas.json: ${Object.keys(fichas).length} fichas`);
