import { useCallback, useEffect, useRef, useState } from 'react';
import { MARKETPLACES, getMarketplace, getPaises } from './config/marketplaces';
import { readMaestro } from './engine/maestro';
import type { Maestro } from './engine/maestro';
import { generar } from './engine/generar';
import { generarMakro } from './engine/makro';
import { descargar, fetchAsset } from './engine/excel';
import { CLAVE_MAESTRO, borrar, claveMakro, guardar, leer } from './store';
import './App.css';

const MAESTRO_INCLUIDO = 'datos/FICHERO_MAESTRO2.xlsx';
const PORTALES = MARKETPLACES.filter((m) => !m.flujoPropio);
const PAISES_MAKRO = getMarketplace('Makro')!.paises;

type Fichero = { nombre: string; blob: Blob };
type Linea = { texto: string; tipo: 'info' | 'ok' | 'error' };

export default function App() {
  const [maestro, setMaestro] = useState<Maestro | null>(null);
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
        setOrigenMaestro(guardado.nombre);
        setPropio(true);
      } else {
        setMaestro(readMaestro(await fetchAsset(MAESTRO_INCLUIDO)));
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

  return (
    <div className="app">
      <header>
        <h1>TwinThink · Marketplaces</h1>
        <p className="sub">
          Genera los ficheros de catálogo y oferta de cada portal desde el fichero maestro. Todo
          ocurre en tu navegador: los datos no se envían a ningún servidor.
        </p>
      </header>

      <Maestros
        origen={origenMaestro}
        propio={propio}
        ocupado={ocupado}
        onSubir={subirMaestro}
        onVolver={volverAlIncluido}
      />

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

      <Resultados ficheros={ficheros} />
      <Registro lineas={lineas} onLimpiar={() => setLineas([])} />
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
          Usar mi maestro
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
  const [precio, setPrecio] = useState<File | null>(null);
  const [stock, setStock] = useState<File | null>(null);

  const aplicar = async () => {
    if (!props.maestro) return;
    if (!precio && !stock) {
      props.log('Sube al menos uno de los dos CSV (precio o stock).', 'error');
      return;
    }
    props.setOcupado(true);
    const salidas: Fichero[] = [];
    try {
      const csvPrecio = precio ? await precio.text() : '';
      const csvStock = stock ? await stock.text() : '';
      const lista = pais === 'Todos' ? PAISES_MAKRO : [pais];

      for (const p of lista) {
        try {
          // La base es la plantilla ya actualizada si existe; si no, la incluida.
          const guardada = await leer(claveMakro(p));
          const base = guardada ? guardada.bytes : await fetchAsset(`plantillas/Makro/offer_template ${p}.xlsx`);
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
      <p className="pista">
        Makro no se reconstruye desde el maestro: su plantilla ya trae los precios buenos. Solo se
        cambia lo que venga en los CSV. Lo que no aparezca, no se toca.
      </p>
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
        <ArchivoCsv etiqueta="CSV de precios" file={precio} onChange={setPrecio} />
        <ArchivoCsv etiqueta="CSV de stock" file={stock} onChange={setStock} />
      </div>
      <div className="fila">
        <button onClick={aplicar} disabled={props.ocupado || !props.maestro}>
          Aplicar y generar
        </button>
        <button className="secundario" onClick={restablecer} disabled={props.ocupado}>
          Restablecer plantillas
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

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function acortar(s: string): string {
  return s.length > 28 ? `${s.slice(0, 25)}...` : s;
}
