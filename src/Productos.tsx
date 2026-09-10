/**
 * Visor del fichero maestro: ficha completa de cada producto.
 *
 * No genera nada ni toca el maestro, solo lo enseña. Las secciones se arman a
 * partir de las claves que trae cada fila, asi que si el maestro gana columnas
 * nuevas aparecen solas en "Otros datos" sin tocar este archivo.
 */
import { useMemo, useState } from 'react';
import type { FilaMaestro, FilaOferta, Maestro } from './engine/maestro';

const IDIOMAS: Record<string, string> = {
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
  it: 'Italiano',
  de: 'Deutsch',
  en: 'English',
};

const PAISES_IMG: Record<string, string> = {
  es: 'España',
  it: 'Italia',
  fr: 'Francia',
  de: 'Alemania',
  uk: 'Reino Unido',
  pt: 'Portugal',
  nl: 'Países Bajos',
};

/** Campos con nombre bonito, agrupados. Lo que no salga aqui cae en "Otros datos". */
const GRUPOS: { titulo: string; campos: [string, string][] }[] = [
  {
    titulo: 'Identificación',
    campos: [
      ['sku_canonico', 'SKU canónico'],
      ['ean', 'EAN'],
      ['marca', 'Marca'],
      ['tipo', 'Tipo'],
      ['modelo', 'Modelo'],
      ['color', 'Color (código)'],
      ['color_nombre', 'Color'],
    ],
  },
  {
    titulo: 'Medidas y peso',
    campos: [
      ['alto_cm', 'Alto (cm)'],
      ['ancho_cm', 'Ancho (cm)'],
      ['fondo_cm', 'Fondo (cm)'],
      ['peso_kg', 'Peso (kg)'],
    ],
  },
  {
    titulo: 'Características',
    campos: [
      ['material', 'Material'],
      ['acabado', 'Acabado'],
      ['forma', 'Forma'],
      ['estilo', 'Estilo'],
      ['num_puertas', 'Nº de puertas'],
      ['cierre', 'Cierre'],
      ['incluye', 'Incluye'],
      ['pais_fabricacion', 'País de fabricación'],
    ],
  },
];

/** Claves que ya se enseñan en otro sitio y no deben repetirse en "Otros datos". */
const TEXTOS = ['titulo', 'descripcion', 'bullets', 'keywords'];

export default function Productos({ maestro }: { maestro: Maestro | null }) {
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState(0);

  const filas = maestro?.catalogo ?? [];
  const encontrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) =>
      Object.values(f).some((v) => String(v ?? '').toLowerCase().includes(q)),
    );
  }, [filas, busca]);

  if (!maestro) {
    return (
      <section className="tarjeta">
        <h2>Productos</h2>
        <p className="pista">Cargando el fichero maestro...</p>
      </section>
    );
  }

  const producto = encontrados[Math.min(sel, encontrados.length - 1)];

  return (
    <>
      <section className="tarjeta">
        <div className="cabecera-registro">
          <h2>Productos del maestro</h2>
          <span className="chip">{filas.length} referencias</span>
        </div>
        <p className="pista">
          Todo lo que hay en la hoja MAESTRO: medidas, características, imágenes y los textos de
          cada idioma. Es lo que se vuelca luego en cada portal.
        </p>
        <div className="fila">
          <input
            className="buscador"
            type="search"
            placeholder="Buscar por SKU, EAN, color, título..."
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setSel(0);
            }}
          />
        </div>
        <div className="rejilla-productos">
          {encontrados.map((f, i) => (
            <button
              key={String(f['sku_canonico'] ?? i)}
              className={`producto ${f === producto ? 'activo' : ''}`}
              onClick={() => setSel(i)}
            >
              <Miniatura fila={f} />
              <span className="producto-ref">{txt(f['sku_canonico']) || '(sin SKU)'}</span>
              <span className="producto-sub">
                {[txt(f['color_nombre']), txt(f['num_puertas']) && `${txt(f['num_puertas'])}p`]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
          ))}
          {encontrados.length === 0 && <p className="pista">Nada coincide con esa búsqueda.</p>}
        </div>
      </section>

      {producto && <Ficha fila={producto} ofertas={maestro.ofertas} />}
    </>
  );
}

// ---------------------------------------------------------------- ficha

function Ficha({ fila, ofertas }: { fila: FilaMaestro; ofertas: FilaOferta[] }) {
  const ean = txt(fila['ean']);
  const ref = txt(fila['sku_canonico']);
  const mias = ofertas.filter(
    (o) => txt(o['EAN']) === ean || (ref !== '' && txt(o['ref']) === ref),
  );

  return (
    <>
      <Imagenes fila={fila} />

      {GRUPOS.map((g) => {
        const pares = g.campos.filter(([k]) => txt(fila[k]) !== '');
        if (pares.length === 0) return null;
        return (
          <section className="tarjeta" key={g.titulo}>
            <h2>{g.titulo}</h2>
            <dl className="datos">
              {pares.map(([k, etiqueta]) => (
                <div key={k}>
                  <dt>{etiqueta}</dt>
                  <dd>{txt(fila[k])}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}

      <Referencias fila={fila} />
      <Textos fila={fila} />
      <Ofertas filas={mias} />
      <Otros fila={fila} />
    </>
  );
}

// ---------------------------------------------------------------- imagenes

function Imagenes({ fila }: { fila: FilaMaestro }) {
  const porPais = new Map<string, string[]>();
  for (const [k, v] of Object.entries(fila)) {
    const m = /^img_([a-z]{2})_(\d+)$/.exec(k);
    if (!m || txt(v) === '') continue;
    const lista = porPais.get(m[1]) ?? [];
    lista.push(String(v));
    porPais.set(m[1], lista);
  }
  const paises = [...porPais.keys()];
  const [pais, setPais] = useState(paises[0] ?? '');
  const activo = porPais.has(pais) ? pais : paises[0];

  if (paises.length === 0) {
    return (
      <section className="tarjeta">
        <h2>Imágenes</h2>
        <p className="pista">Esta referencia no tiene imágenes en el maestro.</p>
      </section>
    );
  }

  const urls = porPais.get(activo)!;
  return (
    <section className="tarjeta">
      <div className="cabecera-registro">
        <h2>Imágenes</h2>
        <div className="pestanas">
          {paises.map((p) => (
            <button
              key={p}
              className={`pestana ${p === activo ? 'activa' : ''}`}
              onClick={() => setPais(p)}
            >
              {PAISES_IMG[p] ?? p.toUpperCase()} <em>{porPais.get(p)!.length}</em>
            </button>
          ))}
        </div>
      </div>
      <div className="galeria">
        {urls.map((u, i) => (
          <a key={u} href={u} target="_blank" rel="noreferrer" title={u}>
            <img src={u} alt={`imagen ${i + 1}`} loading="lazy" />
            <span>{i + 1}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------ referencias

function Referencias({ fila }: { fila: FilaMaestro }) {
  const pares = Object.entries(fila).filter(
    ([k, v]) => (k.startsWith('sku_') || k.startsWith('amazon_')) && k !== 'sku_canonico' && txt(v) !== '',
  );
  if (pares.length === 0) return null;
  return (
    <section className="tarjeta">
      <h2>Referencias por portal</h2>
      <dl className="datos">
        {pares.map(([k, v]) => (
          <div key={k}>
            <dt>{k.replace(/_/g, ' ')}</dt>
            <dd className="mono">{txt(v)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------- textos

function Textos({ fila }: { fila: FilaMaestro }) {
  const idiomas = Object.keys(IDIOMAS).filter((l) =>
    TEXTOS.some((t) => txt(fila[`${t}_${l}`]) !== ''),
  );
  const [lang, setLang] = useState(idiomas[0] ?? 'es');
  const activo = idiomas.includes(lang) ? lang : idiomas[0];
  if (!activo) return null;

  const bloques: [string, string][] = [
    ['Título', txt(fila[`titulo_${activo}`])],
    ['Descripción', txt(fila[`descripcion_${activo}`])],
    ['Bullets', txt(fila[`bullets_${activo}`])],
    ['Keywords', txt(fila[`keywords_${activo}`])],
  ];

  return (
    <section className="tarjeta">
      <div className="cabecera-registro">
        <h2>Textos</h2>
        <div className="pestanas">
          {idiomas.map((l) => (
            <button
              key={l}
              className={`pestana ${l === activo ? 'activa' : ''}`}
              onClick={() => setLang(l)}
            >
              {IDIOMAS[l]}
            </button>
          ))}
        </div>
      </div>
      {bloques.map(([etiqueta, valor]) =>
        valor === '' ? null : (
          <div className="texto" key={etiqueta}>
            <div className="texto-cab">
              <span className="etiqueta">
                {etiqueta} · {valor.length} car.
              </span>
              <button className="secundario mini" onClick={() => copiar(valor)}>
                Copiar
              </button>
            </div>
            <p>{valor}</p>
          </div>
        ),
      )}
    </section>
  );
}

// ---------------------------------------------------------------- ofertas

function Ofertas({ filas }: { filas: FilaOferta[] }) {
  return (
    <section className="tarjeta">
      <h2>Precio y stock por portal</h2>
      {filas.length === 0 ? (
        <p className="pista">Esta referencia no aparece en la hoja Ofertas.</p>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Portal</th>
                <th>País</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Plazo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((o, i) => (
                <tr key={i}>
                  <td>{txt(o['Marketplace'])}</td>
                  <td>{txt(o['Pais'])}</td>
                  <td className="num">{txt(o['Precio'])}</td>
                  <td className="num">{txt(o['Stock'])}</td>
                  <td className="num">{txt(o['PlazoEnvio'])}</td>
                  <td>{txt(o['Estado'])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- otros

function Otros({ fila }: { fila: FilaMaestro }) {
  const conocidas = new Set<string>(GRUPOS.flatMap((g) => g.campos.map(([k]) => k)));
  const pares = Object.entries(fila).filter(([k, v]) => {
    if (txt(v) === '') return false;
    if (conocidas.has(k)) return false;
    if (/^img_[a-z]{2}_\d+$/.test(k)) return false;
    if (k.startsWith('sku_') || k.startsWith('amazon_')) return false;
    if (TEXTOS.some((t) => k.startsWith(`${t}_`))) return false;
    return true;
  });
  if (pares.length === 0) return null;
  return (
    <section className="tarjeta">
      <h2>Otros datos</h2>
      <dl className="datos">
        {pares.map(([k, v]) => (
          <div key={k}>
            <dt>{k.replace(/_/g, ' ')}</dt>
            <dd>{txt(v)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------- utilidades

function Miniatura({ fila }: { fila: FilaMaestro }) {
  const url = Object.entries(fila).find(
    ([k, v]) => /^img_[a-z]{2}_1$/.test(k) && txt(v) !== '',
  )?.[1];
  if (!url) return <span className="mini-vacia">sin foto</span>;
  return <img className="mini-foto" src={String(url)} alt="" loading="lazy" />;
}

function txt(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

function copiar(t: string) {
  void navigator.clipboard?.writeText(t);
}
