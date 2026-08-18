/** Dimensiones reales de las plantillas (para saber cuanto trabajo real hay). */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ExcelJS from 'exceljs';

const PUBLIC = join(resolve(import.meta.dirname, '..'), 'public');

const ficheros = [
  'plantillas/Leroy Merlin/products-Leroy-All.xlsx',
  'plantillas/Leroy Merlin/offers-Leroy-All.xlsx',
  'plantillas/Makro/offer_template ES.xlsx',
  'datos/FICHERO_MAESTRO2.xlsx',
];

for (const f of ficheros) {
  const t0 = Date.now();
  const b = readFileSync(join(PUBLIC, f));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const carga = Date.now() - t0;
  console.log(`\n${f}  (carga ${carga} ms)`);
  for (const ws of wb.worksheets) {
    console.log(
      `   hoja "${ws.name}": ${ws.rowCount} filas x ${ws.columnCount} cols = ${(ws.rowCount * ws.columnCount).toLocaleString()} celdas`,
    );
  }
}
