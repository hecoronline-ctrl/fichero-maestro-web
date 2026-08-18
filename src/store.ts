/**
 * Persistencia en el navegador (IndexedDB). Sustituye al disco del sistema de
 * escritorio y no cuesta nada: no hay servidor ni base de datos.
 *
 * Guarda:
 *   - 'maestro'       -> el FICHERO_MAESTRO2.xlsx que el usuario haya subido
 *   - 'makro:{PAIS}'  -> la plantilla de Makro ya actualizada (nueva base)
 * Si no hay nada guardado, se usa el fichero que viene incluido con la web.
 */
const DB = 'twinthink-marketplaces';
const STORE = 'archivos';

export type Registro = {
  clave: string;
  nombre: string;
  bytes: Uint8Array;
  fecha: number;
};

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'clave' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function guardar(clave: string, nombre: string, bytes: Uint8Array): Promise<void> {
  const db = await abrir();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ clave, nombre, bytes, fecha: Date.now() } satisfies Registro);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function leer(clave: string): Promise<Registro | null> {
  const db = await abrir();
  try {
    const r = await new Promise<Registro | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(clave);
      req.onsuccess = () => resolve(req.result as Registro | undefined);
      req.onerror = () => reject(req.error);
    });
    return r ?? null;
  } finally {
    db.close();
  }
}

export async function borrar(clave: string): Promise<void> {
  const db = await abrir();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(clave);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const CLAVE_MAESTRO = 'maestro';
export const claveMakro = (pais: string) => `makro:${pais}`;
