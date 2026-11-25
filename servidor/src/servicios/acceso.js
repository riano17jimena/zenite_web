/**
 * Inicio de sesión con dos pasos, bloqueo y recuperación de contraseña.
 *
 * 1. Correo + contraseña. Tras 5 intentos fallidos la cuenta se bloquea
 *    durante 15 minutos y se avisa por correo.
 * 2. Código de 6 dígitos enviado al correo (segundo factor), válido 10 minutos
 *    y con máximo 5 intentos.
 * Al superar ambos pasos se crea una sesión (cookie HttpOnly). En la base solo
 * se guarda el SHA-256 de los tokens y códigos, nunca su valor.
 * @module servicios/acceso
 */
import { ErrorApp, invalido } from '../errores.js';
import {
  HASH_FICTICIO, cifrarContrasena, codigoNumerico, iguales, sha256, tokenAleatorio,
  validarPoliticaContrasena, verificarContrasena,
} from '../seguridad/criptografia.js';

const MENSAJE_CREDENCIALES = 'El correo o la contraseña no son correctos.';
const MINUTO = 60_000;

export const ocultarCorreo = (correo) => {
  const [nombre, dominio] = String(correo).split('@');
  return `${nombre.slice(0, 2)}${'•'.repeat(Math.max(1, nombre.length - 2))}@${dominio}`;
};

const horaColombia = (fecha) => fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });

export const usuarioPublico = (u) => (u ? { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol } : null);

export function crearServicioAcceso({ db, config, correo, historial }) {
  const { intentosAcceso, minutosBloqueo, horasSesion, minutosCodigo, minutosRecuperacion } = config.limites;

  async function crearDesafio(usuario) {
    const desafio = tokenAleatorio();
    const codigo = codigoNumerico();
    // Un solo desafío vigente por usuario.
    await db.codigoVerificacion.deleteMany({ where: { usuarioId: usuario.id, proposito: 'SEGUNDO_FACTOR' } });
    await db.codigoVerificacion.create({
      data: {
        usuarioId: usuario.id,
        proposito: 'SEGUNDO_FACTOR',
        hashDesafio: sha256(desafio),
        hashCodigo: sha256(codigo),
        expira: new Date(Date.now() + minutosCodigo * MINUTO),
      },
    });
    await correo.codigoAcceso(usuario, codigo, minutosCodigo);
    return desafio;
  }

  /**
   * Crea la sesión (cookie) tras validar la contraseña.
   * Segundo factor por correo DESACTIVADO TEMPORALMENTE: sin dominio verificado en
   * Resend, el código de acceso solo le llega al correo dueño de la cuenta de Resend,
   * así que exigirlo bloqueaba el ingreso de cualquier otro usuario. Reactivar
   * devolviendo crearDesafio(usuario) en vez de esto cuando el correo esté resuelto.
   */
  async function crearSesion(usuario, { ip, agente } = {}) {
    const token = tokenAleatorio();
    const expira = new Date(Date.now() + horasSesion * 60 * MINUTO);
    await db.sesion.create({ data: { id: sha256(token), usuarioId: usuario.id, expira, ip: ip ?? null, agente: agente?.slice(0, 200) ?? null } });
    const actualizado = await db.usuario.update({ where: { id: usuario.id }, data: { ultimoAcceso: new Date() } });
    return { token, expira, usuario: usuarioPublico(actualizado) };
  }

  /** Crea un enlace de un solo uso para crear o restablecer la contraseña. */
  async function crearEnlaceContrasena(usuario, minutos) {
    const token = tokenAleatorio();
    await db.codigoVerificacion.deleteMany({ where: { usuarioId: usuario.id, proposito: 'RECUPERACION' } });
    await db.codigoVerificacion.create({
      data: { usuarioId: usuario.id, proposito: 'RECUPERACION', hashDesafio: sha256(token), hashCodigo: '-', expira: new Date(Date.now() + minutos * MINUTO) },
    });
    return token;
  }

  return {
    /** Correo y contraseña. Sin segundo factor por ahora: ver nota en crearSesion. */
    async ingresar({ correo: email, contrasena }, { ip, agente } = {}) {
      const correoNormal = String(email ?? '').trim().toLowerCase();
      const usuario = await db.usuario.findUnique({ where: { correo: correoNormal } });
      if (!usuario || !usuario.activo) {
        await verificarContrasena(String(contrasena ?? ''), HASH_FICTICIO); // mismo tiempo de respuesta
        throw new ErrorApp(401, MENSAJE_CREDENCIALES);
      }
      if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
        throw new ErrorApp(423, `Tu acceso está bloqueado por seguridad hasta las ${horaColombia(usuario.bloqueadoHasta)}. Puedes esperar o restablecer tu contraseña.`);
      }
      const valida = await verificarContrasena(String(contrasena ?? ''), usuario.hashContrasena);
      if (!valida) {
        const intentos = usuario.intentosFallidos + 1;
        if (intentos >= intentosAcceso) {
          const hasta = new Date(Date.now() + minutosBloqueo * MINUTO);
          await db.usuario.update({ where: { id: usuario.id }, data: { intentosFallidos: 0, bloqueadoHasta: hasta } });
          await correo.bloqueo(usuario, horaColombia(hasta)).catch(() => {});
          throw new ErrorApp(423, `Por seguridad bloqueamos el acceso durante ${minutosBloqueo} minutos después de ${intentosAcceso} intentos fallidos. Te enviamos un correo.`);
        }
        await db.usuario.update({ where: { id: usuario.id }, data: { intentosFallidos: intentos } });
        const quedan = intentosAcceso - intentos;
        throw new ErrorApp(401, `${MENSAJE_CREDENCIALES} Te ${quedan === 1 ? 'queda 1 intento' : `quedan ${quedan} intentos`} antes del bloqueo temporal.`);
      }
      await db.usuario.update({ where: { id: usuario.id }, data: { intentosFallidos: 0, bloqueadoHasta: null } });
      return crearSesion(usuario, { ip, agente });
    },

    /** Paso 2: código del correo. Devuelve el token de sesión. */
    async verificarCodigo({ desafio, codigo, ip, agente }) {
      const registro = await db.codigoVerificacion.findUnique({ where: { hashDesafio: sha256(desafio ?? '') }, include: { usuario: true } });
      const invalidoMsg = 'El código no es correcto o ya venció. Revisa el último correo que te enviamos.';
      if (!registro || registro.proposito !== 'SEGUNDO_FACTOR' || registro.usado || registro.expira < new Date() || !registro.usuario.activo) {
        throw new ErrorApp(401, invalidoMsg);
      }
      if (registro.intentos >= intentosAcceso) {
        await db.codigoVerificacion.delete({ where: { id: registro.id } });
        throw new ErrorApp(401, 'Superaste el número de intentos con este código. Vuelve a escribir tu correo y contraseña.');
      }
      if (!iguales(sha256(String(codigo ?? '').replace(/\D/g, '')), registro.hashCodigo)) {
        await db.codigoVerificacion.update({ where: { id: registro.id }, data: { intentos: { increment: 1 } } });
        throw new ErrorApp(401, invalidoMsg);
      }
      await db.codigoVerificacion.update({ where: { id: registro.id }, data: { usado: new Date() } });
      const token = tokenAleatorio();
      const expira = new Date(Date.now() + horasSesion * 60 * MINUTO);
      await db.sesion.create({ data: { id: sha256(token), usuarioId: registro.usuarioId, expira, ip: ip ?? null, agente: agente?.slice(0, 200) ?? null } });
      const usuario = await db.usuario.update({ where: { id: registro.usuarioId }, data: { ultimoAcceso: new Date() } });
      return { token, expira, usuario: usuarioPublico(usuario) };
    },

    /** Envía un código nuevo para el mismo desafío. */
    async reenviarCodigo({ desafio }) {
      const registro = await db.codigoVerificacion.findUnique({ where: { hashDesafio: sha256(desafio ?? '') }, include: { usuario: true } });
      if (!registro || registro.usado || registro.proposito !== 'SEGUNDO_FACTOR') throw new ErrorApp(401, 'Vuelve a escribir tu correo y contraseña.');
      const codigo = codigoNumerico();
      await db.codigoVerificacion.update({
        where: { id: registro.id },
        data: { hashCodigo: sha256(codigo), intentos: 0, expira: new Date(Date.now() + minutosCodigo * MINUTO) },
      });
      await correo.codigoAcceso(registro.usuario, codigo, minutosCodigo);
      return { correo: ocultarCorreo(registro.usuario.correo) };
    },

    /** Valida el token de la cookie. Inactividad máxima: 60 minutos. */
    async obtenerSesion(token) {
      if (!token) return null;
      const sesion = await db.sesion.findUnique({ where: { id: sha256(token) }, include: { usuario: true } });
      if (!sesion) return null;
      const ahora = new Date();
      const inactiva = ahora - sesion.ultimaActividad > 60 * MINUTO;
      if (sesion.expira < ahora || inactiva || !sesion.usuario.activo) {
        await db.sesion.delete({ where: { id: sesion.id } }).catch(() => {});
        return null;
      }
      if (ahora - sesion.ultimaActividad > MINUTO) {
        await db.sesion.update({ where: { id: sesion.id }, data: { ultimaActividad: ahora } });
      }
      return { sesionId: sesion.id, usuario: sesion.usuario };
    },

    async salir(token) {
      if (token) await db.sesion.deleteMany({ where: { id: sha256(token) } });
    },

    /** Siempre responde igual para no revelar qué correos existen. */
    async solicitarRecuperacion({ correo: email }) {
      const usuario = await db.usuario.findUnique({ where: { correo: String(email ?? '').trim().toLowerCase() } });
      if (!usuario || !usuario.activo) return;
      const token = await crearEnlaceContrasena(usuario, minutosRecuperacion);
      await correo.recuperacion(usuario, `${config.urlApi}/panel/restablecer.html#token=${token}`, minutosRecuperacion);
    },

    crearEnlaceContrasena,

    async restablecer({ token, contrasena }) {
      const errores = validarPoliticaContrasena(contrasena);
      if (errores.length) throw invalido('La contraseña no cumple los requisitos.', { contrasena: errores.join(' ') });
      const registro = await db.codigoVerificacion.findUnique({ where: { hashDesafio: sha256(token ?? '') } });
      if (!registro || registro.proposito !== 'RECUPERACION' || registro.usado || registro.expira < new Date()) {
        throw new ErrorApp(400, 'El enlace no es válido o ya venció. Pide uno nuevo desde «¿Olvidaste tu contraseña?».');
      }
      await db.usuario.update({
        where: { id: registro.usuarioId },
        data: { hashContrasena: await cifrarContrasena(contrasena), intentosFallidos: 0, bloqueadoHasta: null },
      });
      await db.codigoVerificacion.update({ where: { id: registro.id }, data: { usado: new Date() } });
      await db.sesion.deleteMany({ where: { usuarioId: registro.usuarioId } }); // cierra sesiones abiertas
      await historial.registrar({ usuario: { id: registro.usuarioId }, entidad: 'usuario', entidadId: registro.usuarioId, accion: 'ACTUALIZAR', resumen: 'Restableció su contraseña' });
    },

    async cambiarContrasena(usuario, { actual, nueva }, sesionActualId) {
      const registro = await db.usuario.findUnique({ where: { id: usuario.id } });
      if (!(await verificarContrasena(String(actual ?? ''), registro.hashContrasena))) {
        throw invalido('La contraseña actual no es correcta.', { actual: 'La contraseña actual no es correcta.' });
      }
      const errores = validarPoliticaContrasena(nueva);
      if (errores.length) throw invalido('La contraseña nueva no cumple los requisitos.', { nueva: errores.join(' ') });
      await db.usuario.update({ where: { id: usuario.id }, data: { hashContrasena: await cifrarContrasena(nueva) } });
      await db.sesion.deleteMany({ where: { usuarioId: usuario.id, id: { not: sesionActualId } } });
      await historial.registrar({ usuario, entidad: 'usuario', entidadId: usuario.id, accion: 'ACTUALIZAR', resumen: 'Cambió su contraseña' });
    },
  };
}
