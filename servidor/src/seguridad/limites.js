/**
 * Limitador de solicitudes en memoria (ventana deslizante por clave).
 * Suficiente para una sola instancia en Render; protege formularios públicos
 * y el inicio de sesión contra abuso automatizado.
 * @module seguridad/limites
 */
export function crearLimitador({ maximo, ventanaMs }) {
  const registros = new Map();
  const limpiar = setInterval(() => {
    const ahora = Date.now();
    for (const [clave, marcas] of registros) {
      const vigentes = marcas.filter((t) => ahora - t < ventanaMs);
      if (vigentes.length) registros.set(clave, vigentes); else registros.delete(clave);
    }
  }, Math.min(ventanaMs, 60_000));
  limpiar.unref?.();

  return {
    /** Registra un intento. Devuelve { permitido, reintentarEnSeg }. */
    consumir(clave) {
      const ahora = Date.now();
      const marcas = (registros.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
      if (marcas.length >= maximo) {
        return { permitido: false, reintentarEnSeg: Math.ceil((ventanaMs - (ahora - marcas[0])) / 1000) };
      }
      marcas.push(ahora);
      registros.set(clave, marcas);
      return { permitido: true, reintentarEnSeg: 0 };
    },
    reiniciar: () => registros.clear(),
  };
}

/** Middleware de Express que aplica el limitador por dirección IP. */
export function limitarPorIp(limitador, mensaje = 'Hiciste muchas solicitudes seguidas. Espera unos minutos e inténtalo de nuevo.') {
  return (req, res, next) => {
    const { permitido, reintentarEnSeg } = limitador.consumir(`${req.ip}:${req.baseUrl}${req.path}`);
    if (permitido) return next();
    res.set('Retry-After', String(reintentarEnSeg));
    return res.status(429).json({ error: mensaje });
  };
}
