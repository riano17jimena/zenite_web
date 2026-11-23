/**
 * Respaldo descargable desde el panel (además del respaldo automático semanal
 * de la base de datos con GitHub Actions, ver docs/RESPALDOS.md).
 * Incluye el contenido, el catálogo de servicios, la configuración y las
 * publicaciones. La base de precios y los datos personales solo se incluyen
 * si se pide expresamente.
 * @module servicios/respaldo
 */
export function crearServicioRespaldo({ db, historial }) {
  return {
    async exportar({ incluirPrecios = false, incluirSolicitudes = false } = {}, usuario) {
      const tablas = {
        hero: await db.hero.findMany({}),
        proyecto: await db.proyecto.findMany({}),
        imagenProyecto: await db.imagenProyecto.findMany({}),
        video: await db.video.findMany({}),
        testimonio: await db.testimonio.findMany({}),
        preguntaFrecuente: await db.preguntaFrecuente.findMany({}),
        datoContacto: await db.datoContacto.findMany({}),
        perfil: await db.perfil.findMany({}),
        medio: await db.medio.findMany({}),
        publicacion: await db.publicacion.findMany({ orderBy: { version: 'desc' }, take: 10 }),
        servicioCatalogo: await db.servicioCatalogo.findMany({}),
        configuracionCotizador: await db.configuracionCotizador.findMany({}),
      };
      if (incluirPrecios) {
        Object.assign(tablas, {
          capitulo: await db.capitulo.findMany({}),
          actividad: await db.actividad.findMany({}),
          insumo: await db.insumo.findMany({}),
          componenteApu: await db.componenteApu.findMany({}),
        });
      }
      if (incluirSolicitudes) {
        Object.assign(tablas, {
          solicitudContacto: await db.solicitudContacto.findMany({}),
          cotizacion: await db.cotizacion.findMany({}),
          cotizacionLinea: await db.cotizacionLinea.findMany({}),
        });
      }
      await historial.registrar({ usuario, entidad: 'respaldo', accion: 'CREAR', resumen: `Descargó un respaldo${incluirPrecios ? ' con base de precios' : ''}${incluirSolicitudes ? ' con solicitudes (datos personales)' : ''}` });
      return { generado: new Date().toISOString(), version: 1, tablas };
    },
  };
}

/** Tareas periódicas: limpieza de accesos vencidos y retención de datos (Ley 1581). */
export function crearTareasMantenimiento({ db, solicitudes }) {
  return {
    async ejecutar() {
      const ahora = new Date();
      const [sesiones, codigos, anonimizadas] = await Promise.all([
        db.sesion.deleteMany({ where: { expira: { lt: ahora } } }),
        db.codigoVerificacion.deleteMany({ where: { expira: { lt: new Date(ahora.getTime() - 24 * 3600_000) } } }),
        solicitudes.anonimizarVencidas(),
      ]);
      return { sesiones: sesiones.count, codigos: codigos.count, anonimizadas };
    },
  };
}
