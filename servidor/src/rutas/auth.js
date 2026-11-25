/**
 * Acceso al panel: contraseña + código enviado al correo (segundo factor),
 * recuperación de contraseña y cierre de sesión.
 * @module rutas/auth
 */
import express from 'express';
import { crearLimitador, limitarPorIp } from '../seguridad/limites.js';
import { asincrono, COOKIE_SESION, exigirSesion, leerCookies, opcionesCookie } from '../middleware/index.js';
import { usuarioPublico } from '../servicios/acceso.js';

const MINUTO = 60_000;

export function rutasAuth({ servicios, config }) {
  const { acceso } = servicios;
  const r = express.Router();
  const limiteIngreso = limitarPorIp(crearLimitador({ maximo: 20, ventanaMs: 15 * MINUTO }), 'Demasiados intentos desde tu conexión. Espera 15 minutos.');
  const limiteCorreo = limitarPorIp(crearLimitador({ maximo: 6, ventanaMs: 60 * MINUTO }), 'Ya enviamos varios correos. Espera un momento antes de pedir otro.');

  r.post('/ingresar', limiteIngreso, asincrono(async (req, res) => {
    const { token, expira, usuario } = await acceso.ingresar(
      { correo: req.body?.correo, contrasena: req.body?.contrasena },
      { ip: req.ip, agente: req.get('user-agent') },
    );
    res.cookie(COOKIE_SESION, token, opcionesCookie(config, expira));
    res.json({ usuario });
  }));

  r.post('/verificar', limiteIngreso, asincrono(async (req, res) => {
    const { token, expira, usuario } = await acceso.verificarCodigo({
      desafio: req.body?.desafio, codigo: req.body?.codigo, ip: req.ip, agente: req.get('user-agent'),
    });
    res.cookie(COOKIE_SESION, token, opcionesCookie(config, expira));
    res.json({ usuario });
  }));

  r.post('/reenviar-codigo', limiteCorreo, asincrono(async (req, res) => {
    res.json(await acceso.reenviarCodigo({ desafio: req.body?.desafio }));
  }));

  r.post('/salir', asincrono(async (req, res) => {
    await acceso.salir(leerCookies(req)[COOKIE_SESION]);
    res.clearCookie(COOKIE_SESION, opcionesCookie(config));
    res.json({ mensaje: 'Cerraste sesión.' });
  }));

  r.get('/yo', exigirSesion, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ usuario: usuarioPublico(req.usuario), urlSitio: config.urlSitio });
  });

  r.post('/recuperar', limiteCorreo, asincrono(async (req, res) => {
    await acceso.solicitarRecuperacion({ correo: req.body?.correo });
    res.json({ mensaje: 'Si el correo pertenece a un usuario del panel, en unos minutos recibirás un enlace para crear una contraseña nueva.' });
  }));

  r.post('/restablecer', limiteIngreso, asincrono(async (req, res) => {
    await acceso.restablecer({ token: req.body?.token, contrasena: req.body?.contrasena });
    res.json({ mensaje: 'Tu contraseña quedó guardada. Ya puedes ingresar.' });
  }));

  r.post('/contrasena', exigirSesion, asincrono(async (req, res) => {
    await acceso.cambiarContrasena(req.usuario, { actual: req.body?.actual, nueva: req.body?.nueva }, req.sesionId);
    res.json({ mensaje: 'Cambiaste tu contraseña. Las demás sesiones abiertas se cerraron.' });
  }));

  return r;
}
