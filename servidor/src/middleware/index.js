/**
 * Middleware compartido: cabeceras de seguridad, CORS del sitio público,
 * sesión del panel por cookie, control de roles, protección CSRF y manejo
 * de errores con mensajes en español.
 * @module middleware
 */
import { ErrorApp, prohibido, traducirErrorBd } from '../errores.js';

export const COOKIE_SESION = 'zenite_sesion';

/** Lee las cookies sin dependencias externas. */
export function leerCookies(req) {
  const resultado = {};
  for (const parte of String(req.headers.cookie ?? '').split(';')) {
    const i = parte.indexOf('=');
    if (i < 1) continue;
    try { resultado[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim()); } catch { /* cookie mal formada */ }
  }
  return resultado;
}

/** Cabeceras de seguridad. El panel solo carga recursos propios (Bootstrap va incluido). */
export function cabecerasSeguridad(config) {
  const medios = config.almacenamiento.supabaseUrl ? ` ${new URL(config.almacenamiento.supabaseUrl).origin}` : '';
  const politica = [
    "default-src 'self'",
    `img-src 'self' data: blob:${medios}`,
    `media-src 'self' blob:${medios}`,
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  // Sitio público servido por este mismo servidor (solo modo demostración): misma política que en Netlify.
  const politicaSitio = "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:" + medios + "; media-src 'self'" + medios + "; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'";
  return (req, res, next) => {
    const esSitio = config.servirSitio && !/^\/(api|panel|medios)(\/|$)/.test(req.path);
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Content-Security-Policy': esSitio ? politicaSitio : politica,
    });
    if (config.produccion) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

/** CORS solo para la API pública (el sitio en Netlify). El panel vive en el mismo origen que la API. */
export function corsPublico(config) {
  return (req, res, next) => {
    const origen = req.headers.origin;
    if (origen && config.origenesPermitidos.includes(origen)) {
      res.set({
        'Access-Control-Allow-Origin': origen,
        Vary: 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      });
    }
    if (req.method === 'OPTIONS') return res.status(origen && config.origenesPermitidos.includes(origen) ? 204 : 403).end();
    next();
  };
}

/**
 * Protección CSRF para el panel: toda operación que cambia datos debe traer la
 * cabecera X-Zenite-Panel (un sitio ajeno no puede añadirla sin CORS) y, si el
 * navegador envía Origin, debe coincidir con el de la API.
 */
export function protegerCsrf(config) {
  const propio = new URL(config.urlApi).origin;
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origen = req.headers.origin;
    if (req.headers['x-zenite-panel'] !== '1' || (origen && origen !== propio && !(config.demo && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origen)))) {
      return next(new ErrorApp(403, 'Solicitud rechazada por seguridad. Recarga la página del panel e inténtalo de nuevo.'));
    }
    next();
  };
}

/** Carga la sesión (si existe) en req.usuario. */
export function cargarSesion(acceso) {
  return async (req, res, next) => {
    try {
      const token = leerCookies(req)[COOKIE_SESION];
      const sesion = await acceso.obtenerSesion(token);
      if (sesion) {
        req.usuario = sesion.usuario;
        req.sesionId = sesion.sesionId;
      }
      next();
    } catch (error) { next(error); }
  };
}

export function exigirSesion(req, res, next) {
  if (!req.usuario) return next(new ErrorApp(401, 'Tu sesión terminó. Vuelve a ingresar.'));
  next();
}

export const exigirRol = (...roles) => (req, res, next) => {
  if (!req.usuario) return next(new ErrorApp(401, 'Tu sesión terminó. Vuelve a ingresar.'));
  if (!roles.includes(req.usuario.rol)) return next(prohibido());
  next();
};

export function opcionesCookie(config, expira) {
  return { httpOnly: true, secure: config.produccion, sameSite: 'strict', path: '/', expires: expira };
}

/** Envuelve un manejador async para pasar sus errores a Express 4. */
export const asincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Convierte errores de zod en { campo: mensaje }. */
function detallesZod(error) {
  const detalles = {};
  for (const issue of error.issues ?? []) {
    const campo = issue.path.join('.') || 'general';
    if (!detalles[campo]) detalles[campo] = issue.message;
  }
  return detalles;
}

export function manejarErrores(config, registro = console) {
  // eslint-disable-next-line no-unused-vars
  return (error, req, res, next) => {
    if (error?.name === 'ZodError' || Array.isArray(error?.issues)) {
      return res.status(400).json({ error: 'Revisa los campos marcados.', detalles: detallesZod(error) });
    }
    if (error?.type === 'entity.too.large' || error?.status === 413) {
      return res.status(413).json({ error: 'El archivo o la información enviada supera el tamaño permitido.' });
    }
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'La información enviada no tiene un formato válido.' });
    const e = traducirErrorBd(error);
    if (e instanceof ErrorApp) {
      return res.status(e.estado).json({ error: e.message, ...(e.detalles ? { detalles: e.detalles } : {}) });
    }
    registro.error?.('[error]', req.method, req.originalUrl, error);
    return res.status(500).json({ error: 'Ocurrió un error inesperado. Inténtalo de nuevo; si continúa, avisa al administrador.' });
  };
}
