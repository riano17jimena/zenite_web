/**
 * Historial de cambios: quién cambió qué, cuándo, y cómo estaba antes y después.
 * @module servicios/historial
 */
const CAMPOS_PRIVADOS = ['hashContrasena', 'hashCodigo', 'hashDesafio'];

function limpiar(valor) {
  if (valor == null) return null;
  const copia = JSON.parse(JSON.stringify(valor));
  const quitar = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      if (CAMPOS_PRIVADOS.includes(k)) delete o[k];
      else quitar(o[k]);
    }
  };
  quitar(copia);
  return copia;
}

export function crearServicioHistorial({ db }) {
  return {
    async registrar({ usuario, entidad, entidadId, accion, resumen, antes = null, despues = null }) {
      await db.historialCambio.create({
        data: {
          usuarioId: usuario?.id ?? null,
          entidad,
          entidadId: entidadId == null ? null : String(entidadId),
          accion,
          resumen,
          antes: limpiar(antes),
          despues: limpiar(despues),
        },
      });
    },

    async listar({ entidad, usuarioId, pagina = 1, porPagina = 30 } = {}) {
      const where = { ...(entidad ? { entidad } : {}), ...(usuarioId ? { usuarioId: Number(usuarioId) } : {}) };
      const [total, registros] = await Promise.all([
        db.historialCambio.count({ where }),
        db.historialCambio.findMany({
          where,
          orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
          skip: (pagina - 1) * porPagina,
          take: porPagina,
          include: { usuario: { select: { id: true, nombre: true } } },
        }),
      ]);
      return { total, pagina, porPagina, registros };
    },

    async obtener(id) {
      return db.historialCambio.findUnique({ where: { id: Number(id) }, include: { usuario: { select: { id: true, nombre: true } } } });
    },
  };
}
