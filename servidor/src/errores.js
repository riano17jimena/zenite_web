/**
 * Errores de la aplicación con código HTTP y mensaje para el usuario.
 * @module errores
 */
export class ErrorApp extends Error {
  /**
   * @param {number} estado  Código HTTP.
   * @param {string} mensaje Texto en español, listo para mostrar.
   * @param {object} [detalles] Errores por campo: { campo: 'mensaje' }.
   */
  constructor(estado, mensaje, detalles) {
    super(mensaje);
    this.estado = estado;
    this.detalles = detalles;
  }
}

export const noEncontrado = (que = 'El elemento') => new ErrorApp(404, `${que} no existe o fue eliminado.`);
export const prohibido = () => new ErrorApp(403, 'Tu usuario no tiene permiso para esta acción.');
export const invalido = (mensaje, detalles) => new ErrorApp(400, mensaje, detalles);

/** Traduce errores conocidos de Prisma a ErrorApp. */
export function traducirErrorBd(error) {
  if (error instanceof ErrorApp) return error;
  switch (error?.code) {
    case 'P2025': return noEncontrado();
    case 'P2002': return new ErrorApp(409, `Ya existe un registro con ese valor (${[].concat(error.meta?.target ?? []).join(', ')}).`);
    case 'P2003': return new ErrorApp(409, 'No se puede eliminar porque está en uso en otra sección. Quítalo de allí primero.');
    default: return error;
  }
}

/** Convierte Decimal de Prisma (o número) a número de JavaScript. */
export const aNumero = (valor) => (valor == null ? null : Number(valor));
