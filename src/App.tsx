import { useCallback, useEffect, useRef, useState } from 'react';
import { MARKETPLACES, getMarketplace, getPaises } from './config/marketplaces';
import { readMaestro } from './engine/maestro';
import type { Maestro } from './engine/maestro';
import { generar } from './engine/generar';
import { anadirFilasQueFaltan, generarMakro } from './engine/makro';
import { esCsvCombinado } from './engine/csv';
import { PAISES_AMAZON, generarAmazon } from './engine/amazon';
import { generarAmazonEsLoader } from './engine/amazonLoader';
import { aplicarPreciosYStock } from './engine/ofertas';
import { blobXlsx, descargar, fetchAsset } from './engine/excel';
import { CLAVE_MAESTRO, borrar, claveMakro, guardar, leer } from './store';
import Productos from './Productos';
import './App.css';

const MAESTRO_INCLUIDO = 'datos/FICHERO_MAESTRO2.xlsx';
const PORTALES = MARKETPLACES.filter((m) => !m.flujoPropio);
const PAISES_MAKRO = getMarketplace('Makro')!.paises;

type Fichero = { nombre: string; blob: Blob };
type Linea = { texto: string; tipo: 'info' | 'ok' | 'error' };

type Vista = 'generar' | 'productos' | 'datos';
const MENU: { id: Vista; nombre: string; pista: string }[] = [
  { id: 'generar', nombre: 'Generar ficheros', pista: 'Catálogos y ofertas de cada portal' },
  { id: 'productos', nombre: 'Productos', pista: 'Ver los datos del maestro' },
  { id: 'datos', nombre: 'Datos de origen', pista: 'Maestro, precios y stock' },
];

export default function App() {
  const [vista, setVista] = useState<Vista>('generar');
  const [maestro, setMaestro] = useState<Maestro | null>(null);
  // Los bytes del .xlsx, aparte del maestro ya leido: hacen falta para reescribir
  // la hoja Ofertas cuando se aplican los CSV de precio y stock.
  const [bytesMaestro, setBytesMaestro] = useState<Uint8Array | null>(null);
  const [origenMaestro, setOrigenMaestro] = useState<string>('cargando...');
  const [propio, setPropio] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [ficheros, setFicheros] = useState<Fichero[]>([]);

  const log = useCallback((texto: string, tipo: Linea['tipo'] = 'info') => {
    setLineas((prev) => [...prev, { texto, tipo }]);
  }, []);

  // ---- carga del maestro (el subido por el usuario, o el incluido) ----
  const cargarMaestro = useCallback(async () => {
    try {
      const guardado = await leer(CLAVE_MAESTRO);
      if (guardado) {
        setMaestro(readMaestro(guardado.bytes));
        setBytesMaestro(guardado.bytes);
        setOrigenMaestro(guardado.nombre);
        setPropio(true);
      } else {
        const bytes = new Uint8Array(await fetchAsset(MAESTRO_INCLUIDO));
        setMaestro(readMaestro(bytes));
        setBytesMaestro(bytes);
        setOrigenMaestro('FICHERO_MAESTRO2.xlsx (incluido)');
        setPropio(false);
      }
    } catch (e) {
      setOrigenMaestro('error al cargar');
      log(`No se pudo leer el maestro: ${mensaje(e)}`, 'error');
    }
  }, [log]);

  useEffect(() => {
    void cargarMaestro();
  }, [cargarMaestro]);

  const subirMaestro = async (file: File) => {
    setOcupado(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      readMaestro(bytes); // valida antes de guardar
      await guardar(CLAVE_MAESTRO, file.name, bytes);
      await cargarMaestro();
      log(`Maestro actualizado: ${file.name}`, 'ok');
    } catch (e) {
      log(`Ese fichero no vale como maestro: ${mensaje(e)}`, 'error');
    } finally {
      setOcupado(false);
    }
  };

  const volverAlIncluido = async () => {
    await borrar(CLAVE_MAESTRO);
    await cargarMaestro();
    log('Se vuelve al maestro incluido con la web.', 'ok');
  };

  // ---- CSV quincenales de precio y stock -> hoja Ofertas del maestro ----
  const aplicarPrecioStock = async (csvStock: string, csvPrecios: string) => {
    if (!bytesMaestro) return;
    setOcupado(true);
    try {
      const r = aplicarPreciosYStock(bytesMaestro, csvStock, csvPrecios);
      await guardar(CLAVE_MAESTRO, `FICHERO_MAESTRO2.xlsx (${hoy()})`, r.bytes);
      await cargarMaestro();
      log(
        `Ofertas actualizadas: ${r.precios} precios y ${r.stocks} stocks. ` +
          `${r.sinTocar} filas de DE/UK sin tocar.`,
        'ok',
      );
      for (const a of r.avisos) log(`   ${a}`);
      setFicheros([
        { nombre: 'FICHERO_MAESTRO2.xlsx', blob: blobXlsx(r.bytes) },
      ]);
      log('Ya puedes generar las ofertas de cualquier portal.');
    } catch (e) {
      log(`No se pudieron aplicar los CSV: ${mensaje(e)}`, 'error');
    } finally {
      setOcupado(false);
    }
  };

  const actual = MENU.find((m) => m.id === vista)!;

  return (
    <div className="marco">
      <aside className="menu">
        <div className="marca">
          <strong>TwinThink</strong>
          <span>Marketplaces</span>
        </div>
        <nav>
          {MENU.map((m) => (
            <button
              key={m.id}
              className={`nav ${m.id === vista ? 'activo' : ''}`}
              onClick={() => setVista(m.id)}
            >
              <span className="nav-nombre">{m.nombre}</span>
              <span className="nav-pista">{m.pista}</span>
            </button>
          ))}
        </nav>
        <div className="pie-menu">
          <span className={`chip ${propio ? 'chip-propio' : ''}`}>{origenMaestro}</span>
          <p className="pista">Todo ocurre en tu navegador: los datos no salen de tu equipo.</p>
        </div>
      </aside>

      <main className="app">
        <header>
          <h1>{actual.nombre}</h1>
          <p className="sub">{actual.pista}</p>
        </header>

        {vista === 'productos' && <Productos maestro={maestro} />}

        {vista === 'datos' && (
          <>
            <Maestros
              origen={origenMaestro}
              propio={propio}
              ocupado={ocupado}
              onSubir={subirMaestro}
              onVolver={volverAlIncluido}
              onDescargar={
                bytesMaestro
                  ? () => descargar(blobXlsx(bytesMaestro), 'FICHERO_MAESTRO2.xlsx')
                  : undefined
              }
            />
            <PreciosStock
              ocupado={ocupado}
              listo={bytesMaestro !== null}
              onAplicar={aplicarPrecioStock}
              onError={(t) => log(t, 'error')}
            />
            <Resultados ficheros={ficheros} />
            <Registro lineas={lineas} onLimpiar={() => setLineas([])} />
          </>
        )}

        {vista === 'generar' && (
          <>
            <Generador
              maestro={maestro}
              ocupado={ocupado}
              setOcupado={setOcupado}
              log={log}
              onFicheros={setFicheros}
            />
            <MakroPanel
              maestro={maestro}
              ocupado={ocupado}
              setOcupado={setOcupado}
              log={log}
              onFicheros={setFicheros}
            />
            <AmazonPanel
              maestro={maestro}
              ocupado={ocupado}
              setOcupado={setOcupado}
              log={log}
              onFicheros={setFicheros}
            />
            <Resultados ficheros={ficheros} />
            <Registro lineas={lineas} onLimpiar={() => setLineas([])} />
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- maestro

function Maestros(props: {
  origen: string;
  propio: boolean;
  ocupado: boolean;
  onSubir: (f: File) => void;
  onVolver: () => void;
  onDescargar?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="tarjeta">
      <h2>Fichero maestro</h2>
      <p className="pista">
        Es la fuente de todo: títulos, descripciones, imágenes, precios y stock. Si tienes una
        versión más nueva, súbela y se recordará en este navegador.
      </p>
      <div className="fila">
        <span className={`chip ${props.propio ? 'chip-propio' : ''}`}>{props.origen}</span>
        <button onClick={() => input.current?.click()} disabled={props.ocupado}>
          Fichero maestro
        </button>
        <button className="secundario" onClick={props.onDescargar} disabled={!props.onDescargar}>
          Descargar fichero maestro
        </button>
        {props.propio && (
          <button className="secundario" onClick={props.onVolver} disabled={props.ocupado}>
            Volver al incluido
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) props.onSubir(f);
          e.target.value = '';
        }}
      />
    </section>
  );
}

// ------------------------------------------------------- precios y stock

function PreciosStock(props: {
  ocupado: boolean;
  listo: boolean;
  onAplicar: (csvStock: string, csvPrecios: string) => void;
  onError: (texto: string) => void;
}) {
  const [csv, setCsv] = useState<File | null>(null);

  const aplicar = async () => {
    if (!csv) return;
    const texto = await csv.text();
    if (!esCsvCombinado(texto)) {
      props.onError(ERROR_CSV);
      return;
    }
    props.onAplicar(texto, texto);
  };

  return (
    <section className="tarjeta">
      <h2>Precios y stock</h2>
      <p className="pista">
        El CSV de precios y stock (<code>nexus_precios_stock</code>). Actualiza la hoja Ofertas del
        maestro y con eso ya se pueden generar las ofertas de todos los portales. Los precios de
        España valen también para Portugal.
      </p>
      <div className="fila">
        <ArchivoCsv etiqueta="CSV de precios y stock" file={csv} onChange={setCsv} />
      </div>
      <div className="fila">
        <button onClick={aplicar} disabled={props.ocupado || !props.listo || !csv}>
          Aplicar a los ficheros
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- generador

function Generador(props: {
  maestro: Maestro | null;
  ocupado: boolean;
  setOcupado: (b: boolean) => void;
  log: (t: string, tipo?: Linea['tipo']) => void;
  onFicheros: (f: Fichero[]) => void;
}) {
  const [portalId, setPortalId] = useState(PORTALES[0].id);
  const [tipo, setTipo] = useState<'catalogo' | 'ofertas'>('catalogo');

  const portal = getMarketplace(portalId)!;
  const tipos = (['catalogo', 'ofertas'] as const).filter((t) => portal[t]);
  const tipoValido = tipos.includes(tipo) ? tipo : tipos[0];
  const paises = getPaises(portal, tipoValido);
  const [pais, setPais] = useState(paises[0]);
  const paisValido = paises.includes(pais) ? pais : paises[0];

  const ejecutar = async (casos: { tipo: 'catalogo' | 'ofertas'; pais: string }[]) => {
    if (!props.maestro) return;
    props.setOcupado(true);
    const salidas: Fichero[] = [];
    try {
      for (const caso of casos) {
        try {
          const r = await generar(portal, caso.tipo, caso.pais, props.maestro);
          salidas.push({ nombre: r.nombre, blob: r.blob });
          props.log(`${portal.nombre} ${caso.pais} ${caso.tipo}: ${r.filas} filas → ${r.nombre}`, 'ok');
          for (const a of r.avisos) props.log(`   aviso: ${a}`);
        } catch (e) {
          props.log(`${portal.nombre} ${caso.pais} ${caso.tipo}: ${mensaje(e)}`, 'error');
        }
      }
      props.onFicheros(salidas);
      if (salidas.length === 1) descargar(salidas[0].blob, salidas[0].nombre);
    } finally {
      props.setOcupado(false);
    }
  };

  const todos = () => {
    const casos: { tipo: 'catalogo' | 'ofertas'; pais: string }[] = [];
    for (const t of tipos) for (const p of getPaises(portal, t)) casos.push({ tipo: t, pais: p });
    return casos;
  };

  return (
    <section className="tarjeta">
      <h2>Generar ficheros</h2>
      <div className="fila">
        <label>
          Portal
          <select value={portalId} onChange={(e) => setPortalId(e.target.value)}>
            {PORTALES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select
            value={tipoValido}
            onChange={(e) => setTipo(e.target.value as 'catalogo' | 'ofertas')}
          >
            {tipos.map((t) => (
              <option key={t} value={t}>
                {t === 'catalogo' ? 'Catálogo' : 'Ofertas'}
              </option>
            ))}
          </select>
        </label>
        <label>
          País
          <select value={paisValido} onChange={(e) => setPais(e.target.value)}>
            {paises.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="fila">
        <button
          onClick={() => ejecutar([{ tipo: tipoValido, pais: paisValido }])}
          disabled={props.ocupado || !props.maestro}
        >
          Generar
        </button>
        <button
          className="secundario"
          onClick={() => ejecutar(todos())}
          disabled={props.ocupado || !props.maestro}
        >
          Generar todo de {portal.nombre} ({todos().length})
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- makro

function MakroPanel(props: {
  maestro: Maestro | null;
  ocupado: boolean;
  setOcupado: (b: boolean) => void;
  log: (t: string, tipo?: Linea['tipo']) => void;
  onFicheros: (f: Fichero[]) => void;
}) {
  const [pais, setPais] = useState('Todos');
  const [csv, setCsv] = useState<File | null>(null);

  const aplicar = async () => {
    if (!props.maestro || !csv) return;
    const texto = await csv.text();
    if (!esCsvCombinado(texto)) {
      props.log(ERROR_CSV, 'error');
      return;
    }
    props.setOcupado(true);
    const salidas: Fichero[] = [];
    try {
      const csvPrecio = texto;
      const csvStock = texto;
      const lista = pais === 'Todos' ? PAISES_MAKRO : [pais];

      for (const p of lista) {
        try {
          // La base es la plantilla ya actualizada si existe; si no, la incluida.
          const guardada = await leer(claveMakro(p));
          const incluida = await fetchAsset(`plantillas/Makro/offer_template ${p}.xlsx`);
          let base: ArrayBuffer | Uint8Array = incluida;
          if (guardada) {
            // Si la web trae productos nuevos (p. ej. los bancos), se suman a la guardada.
            const m = anadirFilasQueFaltan(guardada.bytes, incluida);
            base = m.bytes;
            if (m.anadidas.length) {
              props.log(`Makro ${p}: ${m.anadidas.length} productos nuevos añadidos a tu plantilla.`);
            }
          }
          const r = generarMakro(p, base, props.maestro.catalogo, csvPrecio, csvStock);
          if (!r) {
            props.log(`Makro ${p}: sin datos en los archivos → no se toca.`);
            continue;
          }
          // La plantilla actualizada pasa a ser la base de la proxima vez.
          await guardar(claveMakro(p), `offer_template ${p}.xlsx`, r.bytes);
          salidas.push({ nombre: r.nombre, blob: r.blob });
          props.log(`Makro ${p}: ${r.precios} precios y ${r.stocks} stocks → ${r.nombre}`, 'ok');
        } catch (e) {
          props.log(`Makro ${p}: ${mensaje(e)}`, 'error');
        }
      }
      props.onFicheros(salidas);
      if (salidas.length === 1) descargar(salidas[0].blob, salidas[0].nombre);
    } finally {
      props.setOcupado(false);
    }
  };

  const restablecer = async () => {
    for (const p of PAISES_MAKRO) await borrar(claveMakro(p));
    props.log('Plantillas de Makro restablecidas a las incluidas con la web.', 'ok');
  };

  return (
    <section className="tarjeta">
      <h2>Makro · precio y stock</h2>
      {/* Makro no se reconstruye desde el maestro: su plantilla ya trae los precios
          buenos. Solo se cambia lo que venga en los CSV; lo que no aparezca, no se toca. */}
      <div className="fila">
        <label>
          País
          <select value={pais} onChange={(e) => setPais(e.target.value)}>
            <option value="Todos">Todos</option>
            {PAISES_MAKRO.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <ArchivoCsv etiqueta="CSV de precios y stock" file={csv} onChange={setCsv} />
      </div>
      <div className="fila">
        <button onClick={aplicar} disabled={props.ocupado || !props.maestro || !csv}>
          Aplicar a los ficheros
        </button>
        <button className="secundario" onClick={restablecer} disabled={props.ocupado}>
          Restablecer plantillas
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- amazon

function AmazonPanel(props: {
  maestro: Maestro | null;
  ocupado: boolean;
  setOcupado: (b: boolean) => void;
  log: (t: string, tipo?: Linea['tipo']) => void;
  onFicheros: (f: Fichero[]) => void;
}) {
  const [pais, setPais] = useState('Todos');
  const [tipo, setTipo] = useState<'catalogo' | 'ofertas'>('catalogo');

  const generar = async () => {
    if (!props.maestro) return;
    props.setOcupado(true);
    const salidas: Fichero[] = [];
    try {
      const lista = pais === 'Todos' ? PAISES_AMAZON : [pais];
      for (const p of lista) {
        try {
          // Amazon ES precio y stock: plantilla oficial de Seller Central (ListingLoader)
          const r =
            tipo === 'ofertas' && p === 'ES'
              ? generarAmazonEsLoader(
                  await fetchAsset('plantillas/Amazon/ListingLoader_ES.xlsm'),
                  props.maestro,
                )
              : generarAmazon(tipo, p, props.maestro);
          salidas.push({ nombre: r.nombre, blob: r.blob });
          props.log(`Amazon ${p} ${tipo}: ${r.filas} filas → ${r.nombre}`, 'ok');
          for (const a of r.avisos) props.log(`   aviso: ${a}`);
        } catch (e) {
          props.log(`Amazon ${p} ${tipo}: ${mensaje(e)}`, 'error');
        }
      }
      props.onFicheros(salidas);
      if (salidas.length === 1) descargar(salidas[0].blob, salidas[0].nombre);
    } finally {
      props.setOcupado(false);
    }
  };

  return (
    <section className="tarjeta">
      <h2>Amazon</h2>
      <p className="pista">
        <strong>España · Precio y stock</strong> sale en la plantilla oficial de Seller Central
        (<code>ListingLoader.xlsm</code>, para productos que ya están en Amazon) con las
        referencias que tienen SKU de Amazon ES en el maestro.
      </p>
      <div className="fila">
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'catalogo' | 'ofertas')}>
            <option value="catalogo">Catálogo</option>
            <option value="ofertas">Precio y stock</option>
          </select>
        </label>
        <label>
          País
          <select value={pais} onChange={(e) => setPais(e.target.value)}>
            <option value="Todos">Todos</option>
            {PAISES_AMAZON.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="fila">
        <button onClick={generar} disabled={props.ocupado || !props.maestro}>
          Generar
        </button>
      </div>
    </section>
  );
}

function ArchivoCsv(props: {
  etiqueta: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <label>
      {props.etiqueta}
      <button className="archivo" onClick={() => input.current?.click()} type="button">
        {props.file ? acortar(props.file.name) : 'Elegir archivo...'}
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv"
        hidden
        onChange={(e) => props.onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

// ---------------------------------------------------------------- salidas

function Resultados({ ficheros }: { ficheros: Fichero[] }) {
  if (ficheros.length === 0) return null;
  return (
    <section className="tarjeta">
      <h2>Ficheros generados</h2>
      <ul className="salidas">
        {ficheros.map((f) => (
          <li key={f.nombre}>
            <span>{f.nombre}</span>
            <button className="secundario" onClick={() => descargar(f.blob, f.nombre)}>
              Descargar
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Registro({ lineas, onLimpiar }: { lineas: Linea[]; onLimpiar: () => void }) {
  const fin = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'nearest' });
  }, [lineas]);
  return (
    <section className="tarjeta">
      <div className="cabecera-registro">
        <h2>Registro</h2>
        {lineas.length > 0 && (
          <button className="secundario" onClick={onLimpiar}>
            Limpiar
          </button>
        )}
      </div>
      <div className="registro">
        {lineas.length === 0 && <p className="pista">Aquí aparecerá lo que vaya pasando.</p>}
        {lineas.map((l, i) => (
          <div key={i} className={`linea ${l.tipo}`}>
            {l.texto}
          </div>
        ))}
        <div ref={fin} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- utilidades

const ERROR_CSV =
  'Ese archivo no es el CSV de precios y stock: tiene que traer las columnas Precio_Aplicado y Stock.';

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function acortar(s: string): string {
  return s.length > 28 ? `${s.slice(0, 25)}...` : s;
}

/** dd/mm, para marcar en el chip cuando se aplicaron los CSV. */
function hoy(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
