# TwinThink · Marketplaces (web)

Versión web del sistema de generación de ficheros de marketplaces. Genera los
ficheros de **catálogo** y **oferta** a partir del `FICHERO_MAESTRO2.xlsx`.

Es el mismo motor que el sistema de escritorio en PowerShell
(`Fichero Maestro/Sistema/_sistema/`), portado a TypeScript y **validado celda a
celda contra él**: 7 casos, 0 diferencias.

## Cómo funciona

Todo se ejecuta **en el navegador del usuario**. No hay servidor, ni base de datos,
ni almacenamiento en la nube:

- Vercel solo sirve archivos estáticos → entra en el plan gratuito sin límites de
  ejecución (no hay funciones serverless, así que no hay timeout de 60 s).
- El maestro y las plantillas viajan con la web como assets (~660 KB en total).
- Los ficheros generados se descargan directamente desde el navegador.
- **Los datos nunca salen del ordenador de quien lo usa.**

Como todo es estático, mover el sitio a Cloudflare Pages o GitHub Pages sería
cuestión de minutos si hiciera falta.

## Qué incluye hoy

| Portal | Catálogo | Ofertas |
|---|---|---|
| Leroy Merlin | ES, IT, FR, PT (4 ficheros) | ALL (1 fichero) |
| Makro | — | ES, IT, DE, PT (flujo propio) |

Amazon queda pendiente: no estaba implementado en el sistema de escritorio y hace
falta reunir material (plantillas de ES/IT/PT y SKU/ASIN de esos países).

## Persistencia sin coste

El navegador guarda en IndexedDB:

- **El maestro** que subas con "Usar mi maestro" (si no, se usa el incluido).
- **Las plantillas de Makro ya actualizadas.** En el sistema de escritorio la
  plantilla base se actualizaba en sitio; aquí no hay disco, así que la versión
  actualizada se guarda en el navegador y pasa a ser la base de la siguiente vez.
  "Restablecer plantillas" vuelve a las que trae la web.

## Detalle técnico: por qué no se usa una librería de Excel

`products-Leroy-All.xlsx` trae una hoja oculta `ReferenceData` de **26 × 30.228
celdas** (los desplegables de Mirakl). Cargar el libro entero con `exceljs` costaba
~900 MB de RAM y varios minutos — inviable en un navegador.

`src/engine/xlsx.ts` abre el `.xlsx` como ZIP (fflate) y modifica **solo el XML de
la hoja de datos** (74 × 32). El resto del fichero se reempaqueta byte a byte
idéntico al original, así que estilos, validaciones y hojas de referencia quedan
intactos. Resultado: 25–235 ms por fichero y bundle de 74 KB comprimido.

## Desarrollo

```bash
npm install
npm run dev          # servidor local
npm run build        # build de produccion a dist/
```

### Validar contra el motor PowerShell

Genera primero las referencias con el sistema de escritorio
(`_sistema/Generar.ps1` y `_sistema/tools/Generar-Makro.ps1`), luego:

```bash
npx tsx scripts/validar.ts <carpeta-con-referencias>
npx tsx scripts/validar-makro.ts <ref.xlsx> <PAIS> <precios.csv> <stock.csv>
```

Ambos comparan celda a celda y salen con código distinto de 0 si hay diferencias.

## Añadir o cambiar un portal

Igual que en el sistema de escritorio: **no se toca el motor**, solo
`src/config/marketplaces.ts`, que es el port directo de `marketplaces.psd1`.

1. Copia la plantilla del portal a `public/plantillas/`.
2. Añade su bloque al config con `plantilla`, `hoja`, `filaCabecera`, `filaDatos`,
   `modo` y el `mapa` de columnas.
3. Genera y compara con lo que sube hoy al portal.

## Desplegar en Vercel

1. Sube esta carpeta a un repositorio de GitHub.
2. En vercel.com → **Add New → Project** → importa el repositorio.
3. Vercel detecta Vite solo; no hay variables de entorno que configurar.
4. Deploy.

Cada `git push` vuelve a desplegar automáticamente.

> **Nota sobre el plan gratuito:** los términos del plan Hobby de Vercel son para
> uso no comercial. Al ser una herramienta interna de trabajo estás en zona gris y
> podrían pedirte pasar a Pro. Si pasa, el sitio es estático y se mueve a
> Cloudflare Pages o GitHub Pages (gratis y sí permiten uso comercial) sin tocar
> una línea de código.

## Actualizar el maestro que ve todo el equipo

El maestro incluido está en `public/datos/FICHERO_MAESTRO2.xlsx`. Para que tu
equipo vea una versión nueva, reemplaza ese fichero y haz push: Vercel redespliega
solo. Mientras tanto, cada persona puede subir el suyo con "Usar mi maestro".
