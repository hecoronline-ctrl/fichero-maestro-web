/**
 * Aplica los CSV quincenales de STOCK y PRECIOS sobre la hoja "Ofertas" del
 * maestro — port de _sistema/tools/Actualizar-Ofertas.ps1.
 *
 * REGLAS (las mismas que el sistema de escritorio):
 *   - Datos de ESPANA (ES/PT) -> filas de pais ES, PT y ALL (Leroy).
 *   - ITALIA -> IT ; FRANCIA -> FR.
 *   - ALEMANIA (DE) y UK -> NO se tocan (no hay datos).
 *   - El precio de un pais se aplica igual a todos sus marketplaces.
 *   - El CSV de precios es de CAMBIOS: solo se toca lo que trae.
 *   - Cruce por numero de modelo (001/003/007/010/011) + color (G/N/B/B-N).
 *     El modelo 003 viene como EMD.003 en los CSV y como SYN.003 en el maestro:
 *     por eso el cruce es por numero, no por familia.
 *   - El color "Madera" se ignora (no se vende).
 *
 * DIFERENCIA CON EL SCRIPT DE ESCRITORIO — el CSV de stock cambio de formato
 * hacia el 26/06/2026: antes traia Producto='1' y SKU='EMD.001', ahora trae
 * Producto='R.EMD.001' y SKU='1'. El script solo miraba el numero de modelo en
 * SKU cuando Producto no era de 3 cifras, asi que con el formato nuevo dejo de
 * cruzar y el stock no se actualizaba. Aqui el numero de modelo se busca en las
 * dos columnas, con lo que valen los dos formatos.
 */
import { campo, parseCsv } from './csv';
import { Libro } from './xlsx';

export type ResultadoOfertas = {
  bytes: Uint8Array;
  precios: number;
  stocks: number;
  sinTocar: number;
  avisos: string[];
};

// ---------------------------------------------------------------- mapeos

/** Nombre de color del CSV de stock -> codigo canonico. */
function colorDeNombre(c: string): string | null {
  switch (c.trim().toLowerCase()) {
    case 'gris':
      return 'G';
    case 'negro':
      return 'N';
    case 'blanco':
      return 'B';
    case 'b&n':
    case 'byn':
    case 'b&w':
      return 'B-N';
    default:
      return null; // "Madera" y cualquier otro: no se vende
  }
}

/** Sufijo del SKU/ref -> codigo canonico. Sin sufijo = Gris. */
function colorDeSufijo(s: string): string | null {
  if (s.trim() === '') return 'G';
  switch (s.trim().toUpperCase()) {
    case 'G':
    case 'GR':
      return 'G';
    case 'N':
    case 'NE':
      return 'N';
    case 'B':
    case 'BL':
      return 'B';
    case 'B&N':
    case 'BYN':
    case 'B&W':
    case 'B-N':
      return 'B-N';
    default:
      return null;
  }
}

/** Numero de modelo de un texto: 'R.EMD.001_N' -> '001' ; 'EMD.001' -> '001'. */
function modeloDe(texto: string): string | null {
  const t = String(texto ?? '').trim();
  if (t === '') return null;
  const estricto = /\.(\d{3})(?:_|$)/.exec(t);
  if (estricto) return estricto[1];
  if (/^\d{3}$/.test(t)) return t;
  const suelto = /(\d{3})/.exec(t);
  return suelto ? suelto[1] : null;
}

/** Primer numero de modelo que aparezca en cualquiera de los textos dados. */
function modelo(...textos: string[]): string | null {
  for (const t of textos) {
    const m = modeloDe(t);
    if (m) return m;
  }
  return null;
}

/** Sufijo de color de un SKU/ref: 'R.EMD.001_B-N' -> 'B-N' ; 'R.SYN.007' -> ''. */
function sufijoDe(ref: string): string {
  const m = /\.\d{3}_(.+)$/.exec(String(ref ?? '').trim());
  return m ? m[1] : '';
}

/** Pais de una fila de la hoja Ofertas -> codigo de datos. */
function paisDeDatos(pais: string): string | null {
  switch (pais.trim().toUpperCase()) {
    case 'ES':
    case 'PT':
    case 'ALL':
      return 'ES';
    case 'IT':
      return 'IT';
    case 'FR':
      return 'FR';
    default:
      return null; // DE, UK: no se tocan
  }
}

/** Pais del CSV de stock -> codigo de datos. */
function paisDeStock(p: string): string | null {
  switch (p.trim().toUpperCase()) {
    case 'ES/PT':
    case 'ES':
    case 'PT':
    case 'ESPANA':
    case 'ESPAÑA':
      return 'ES';
    case 'ITALIA':
    case 'IT':
      return 'IT';
    case 'FRANCIA':
    case 'FR':
      return 'FR';
    default:
      return null;
  }
}

/** Pais del CSV de precios -> codigo de datos. */
function paisDePrecio(c: string): string | null {
  switch (c.trim().toUpperCase()) {
    case 'ES':
      return 'ES';
    case 'IT':
      return 'IT';
    case 'FR':
      return 'FR';
    default:
      return null; // DE, UK: no tocar
  }
}

// ---------------------------------------------------------------- lectura

export type Carga = { mapa: Map<string, number>; leidas: number; ignoradas: number };

/** CSV de stock -> clave 'PAIS|MODELO|COLOR' = unidades. */
export function cargarStock(csv: string): Carga {
  const mapa = new Map<string, number>();
  let leidas = 0;
  let ignoradas = 0;
  for (const r of parseCsv(csv)) {
    const g = paisDeStock(campo(r, 'Pais', 'País', 'country'));
    const col = colorDeNombre(campo(r, 'Color'));
    const mod = modelo(campo(r, 'Producto'), campo(r, 'SKU'));
    const n = Number(campo(r, 'Stock').replace(',', '.'));
    if (!g || !col || !mod || !Number.isFinite(n)) {
      ignoradas++;
      continue;
    }
    mapa.set(`${g}|${mod}|${col}`, Math.trunc(n));
    leidas++;
  }
  return { mapa, leidas, ignoradas };
}

/** CSV de precios -> clave 'PAIS|MODELO|COLOR' = applied_price. */
export function cargarPrecios(csv: string): Carga {
  const mapa = new Map<string, number>();
  let leidas = 0;
  let ignoradas = 0;
  for (const r of parseCsv(csv)) {
    const c = paisDePrecio(campo(r, 'country', 'Pais', 'País'));
    const sku = campo(r, 'sku', 'SKU');
    const mod = modelo(sku);
    const col = colorDeSufijo(sufijoDe(sku));
    const bruto = campo(r, 'applied_price', 'Precio').replace(',', '.');
    const n = Number(bruto);
    if (!c || !mod || !col || bruto === '' || !Number.isFinite(n)) {
      ignoradas++;
      continue;
    }
    mapa.set(`${c}|${mod}|${col}`, n);
    leidas++;
  }
  return { mapa, leidas, ignoradas };
}

// ---------------------------------------------------------------- escritura

/**
 * Devuelve una copia del maestro con la hoja Ofertas actualizada. Cualquiera de
 * los dos CSV puede venir vacio: lo que no aparezca, no se toca.
 */
export function aplicarPreciosYStock(
  bytes: ArrayBuffer | Uint8Array,
  csvStock: string,
  csvPrecios: string,
): ResultadoOfertas {
  const avisos: string[] = [];
  const stock = csvStock.trim() ? cargarStock(csvStock) : null;
  const precio = csvPrecios.trim() ? cargarPrecios(csvPrecios) : null;

  if (!stock?.mapa.size && !precio?.mapa.size) {
    throw new Error(
      'Los CSV no traen ninguna linea aprovechable. Comprueba que el de stock tiene las columnas ' +
        'Producto, SKU, Pais, Color y Stock, y el de precios sku, country y applied_price.',
    );
  }
  if (stock) avisos.push(`Stock: ${stock.leidas} lineas leidas, ${stock.ignoradas} ignoradas.`);
  if (precio) avisos.push(`Precios: ${precio.leidas} cambios leidos, ${precio.ignoradas} ignorados.`);

  const libro = Libro.abrir(bytes);
  if (!libro.tieneHoja('Ofertas')) throw new Error("El maestro no tiene hoja 'Ofertas'.");
  const hoja = libro.hoja('Ofertas');

  const cols = new Map<string, number>();
  for (let c = 1; c <= hoja.ultimaColumna; c++) {
    const h = hoja.get(1, c);
    if (h !== null && String(h).trim() !== '') cols.set(String(h).trim(), c);
  }
  for (const necesaria of ['Pais', 'ref', 'Precio', 'Stock']) {
    if (!cols.has(necesaria)) {
      throw new Error(`Falta la columna '${necesaria}' en la hoja Ofertas del maestro.`);
    }
  }
  const cPais = cols.get('Pais')!;
  const cRef = cols.get('ref')!;
  const cPrecio = cols.get('Precio')!;
  const cStock = cols.get('Stock')!;

  let nPrecios = 0;
  let nStocks = 0;
  let sinTocar = 0;
  let sinCruce = 0;

  for (let r = 2; r <= hoja.ultimaFila; r++) {
    const ref = hoja.texto(r, cRef);
    if (ref === '') continue;
    const dc = paisDeDatos(hoja.texto(r, cPais));
    if (!dc) {
      sinTocar++; // DE / UK
      continue;
    }
    const mod = modeloDe(ref);
    const col = colorDeSufijo(sufijoDe(ref));
    if (!mod || !col) {
      sinCruce++;
      continue;
    }
    const clave = `${dc}|${mod}|${col}`;
    const p = precio?.mapa.get(clave);
    if (p !== undefined) {
      hoja.set(r, cPrecio, p);
      nPrecios++;
    }
    const s = stock?.mapa.get(clave);
    if (s !== undefined) {
      hoja.set(r, cStock, s);
      nStocks++;
    }
  }

  if (sinCruce > 0) {
    avisos.push(`${sinCruce} filas sin modelo/color reconocible en la columna 'ref'.`);
  }
  if (stock?.mapa.size && nStocks === 0) {
    avisos.push('El CSV de stock no ha cruzado con ninguna fila. Revisa modelos y colores.');
  }
  if (precio?.mapa.size && nPrecios === 0) {
    avisos.push('El CSV de precios no ha cruzado con ninguna fila. Revisa los SKU.');
  }

  return { bytes: libro.guardar(), precios: nPrecios, stocks: nStocks, sinTocar, avisos };
}
