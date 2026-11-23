/**
 * Migra el contenido actual del sitio (textos, portafolio, videos, fotos) y la
 * base de precios a PostgreSQL. Uso: `npm run db:sembrar` (después de
 * `npm run db:migrar`). Se puede ejecutar varias veces: omite lo que ya existe.
 */
import { crearServicios, RUTAS } from '../src/app.js';
import { cargarConfiguracion } from '../src/config.js';
import { crearDb } from '../src/db.js';
import { sembrarContenido, sembrarCotizador } from '../src/servicios/semilla.js';

const config = cargarConfiguracion();
const db = await crearDb(config);
const servicios = crearServicios({ db, config });
try {
  console.log(`Subiendo fotos y videos a «${servicios.almacenamiento.nombre}»…`);
  const contenido = await sembrarContenido({ db, medios: servicios.medios, almacenamiento: servicios.almacenamiento, rutaDatos: RUTAS.datosIniciales, raiz: RUTAS.raizServidor });
  console.log(contenido.omitido ? 'El contenido ya existía: no se modificó.' : 'Contenido migrado.');
  const precios = await sembrarCotizador({ db, rutaDatos: RUTAS.datosIniciales, carpetaPrivada: RUTAS.datosPrivados });
  if (precios.actividades) {
    console.log(`Base de precios: ${precios.capitulos} capítulos, ${precios.actividades} actividades, ${precios.insumos} insumos, ${precios.componentes} componentes de APU.`);
    const cambiadas = await servicios.cotizador.recalcularActividades(null);
    console.log(`Precios verificados con el APU (${cambiadas.cambiadas} ajustes).`);
  } else {
    console.log('Base de precios: ya cargada o no se encontró prisma/datos-privados (ejecuta primero npm run db:importar-excel).');
  }
  if (!(await db.publicacion.count())) {
    await servicios.publicacion.publicar({ nota: 'Contenido migrado del sitio anterior' }, null);
    console.log('Publicada la versión 1 del sitio.');
  }
} finally {
  await db.$disconnect?.();
}
