/**
 * Gestión de usuarios del panel (solo administradores).
 * Al crear un usuario se le envía un enlace para que cree su propia contraseña.
 * @module servicios/usuarios
 */
import { z } from 'zod';
import { ErrorApp, invalido, noEncontrado } from '../errores.js';
import { cifrarContrasena, tokenAleatorio } from '../seguridad/criptografia.js';
import { usuarioPublico } from './acceso.js';

const HORAS_INVITACION = 72;

const esquemaUsuario = z.object({
  nombre: z.string().trim().min(3, 'Escribe el nombre completo (mínimo 3 letras).').max(80),
  correo: z.string().trim().toLowerCase().email('Escribe un correo válido.'),
  rol: z.enum(['ADMINISTRADOR', 'EDITOR'], { message: 'Elige un rol.' }),
});

const esquemaEdicion = esquemaUsuario.partial().extend({ activo: z.boolean().optional() });

const detalle = (u) => ({
  ...usuarioPublico(u),
  activo: u.activo,
  bloqueado: Boolean(u.bloqueadoHasta && u.bloqueadoHasta > new Date()),
  bloqueadoHasta: u.bloqueadoHasta,
  ultimoAcceso: u.ultimoAcceso,
  creado: u.creado,
});

export function crearServicioUsuarios({ db, config, correo, historial, acceso }) {
  async function contarAdministradoresActivos(excepto) {
    return db.usuario.count({ where: { rol: 'ADMINISTRADOR', activo: true, ...(excepto ? { id: { not: excepto } } : {}) } });
  }

  /**
   * Intenta enviar la invitación por correo. Si falla (p. ej. el remitente de Resend
   * no tiene un dominio verificado y no puede enviar a este destinatario), no revienta
   * la operación: devuelve el enlace para que el administrador lo copie y lo envíe él mismo.
   */
  async function enviarInvitacion(usuario, url) {
    try {
      await correo.invitacion(usuario, url, HORAS_INVITACION);
      return true;
    } catch (error) {
      console.error(`[correo] No se pudo enviar la invitación a ${usuario.correo}:`, error);
      return false;
    }
  }

  return {
    async listar() {
      const usuarios = await db.usuario.findMany({ orderBy: [{ nombre: 'asc' }] });
      return usuarios.map(detalle);
    },

    async crear(datos, autor) {
      const valores = esquemaUsuario.parse(datos);
      if (await db.usuario.findUnique({ where: { correo: valores.correo } })) {
        throw invalido('Ya existe un usuario con ese correo.', { correo: 'Ya existe un usuario con ese correo.' });
      }
      // Contraseña aleatoria imposible de adivinar; el usuario crea la suya con el enlace.
      const usuario = await db.usuario.create({ data: { ...valores, hashContrasena: await cifrarContrasena(tokenAleatorio(48)) } });
      const token = await acceso.crearEnlaceContrasena(usuario, HORAS_INVITACION * 60);
      const enlace = `${config.urlApi}/panel/restablecer.html#token=${token}&nuevo=1`;
      const enviado = await enviarInvitacion(usuario, enlace);
      await historial.registrar({ usuario: autor, entidad: 'usuario', entidadId: usuario.id, accion: 'CREAR', resumen: `Creó el usuario ${usuario.nombre} (${usuario.rol})`, despues: detalle(usuario) });
      return { ...detalle(usuario), enlaceInvitacion: enviado ? null : enlace };
    },

    async actualizar(id, datos, autor) {
      const valores = esquemaEdicion.parse(datos);
      const actual = await db.usuario.findUnique({ where: { id: Number(id) } });
      if (!actual) throw noEncontrado('El usuario');
      const quitaAdmin = actual.rol === 'ADMINISTRADOR' && ((valores.rol && valores.rol !== 'ADMINISTRADOR') || valores.activo === false);
      if (quitaAdmin && (await contarAdministradoresActivos(actual.id)) === 0) {
        throw new ErrorApp(409, 'Debe quedar al menos un administrador activo.');
      }
      if (actual.id === autor.id && valores.activo === false) throw new ErrorApp(409, 'No puedes desactivar tu propio usuario.');
      if (valores.correo && valores.correo !== actual.correo && (await db.usuario.findUnique({ where: { correo: valores.correo } }))) {
        throw invalido('Ya existe un usuario con ese correo.', { correo: 'Ya existe un usuario con ese correo.' });
      }
      const usuario = await db.usuario.update({ where: { id: actual.id }, data: valores });
      if (valores.activo === false || (valores.rol && valores.rol !== actual.rol)) await db.sesion.deleteMany({ where: { usuarioId: actual.id } });
      await historial.registrar({ usuario: autor, entidad: 'usuario', entidadId: usuario.id, accion: 'ACTUALIZAR', resumen: `Actualizó el usuario ${usuario.nombre}`, antes: detalle(actual), despues: detalle(usuario) });
      return detalle(usuario);
    },

    async desbloquear(id, autor) {
      const usuario = await db.usuario.update({ where: { id: Number(id) }, data: { bloqueadoHasta: null, intentosFallidos: 0 } });
      await historial.registrar({ usuario: autor, entidad: 'usuario', entidadId: usuario.id, accion: 'ACTUALIZAR', resumen: `Desbloqueó el acceso de ${usuario.nombre}` });
      return detalle(usuario);
    },

    async reenviarInvitacion(id, autor) {
      const usuario = await db.usuario.findUnique({ where: { id: Number(id) } });
      if (!usuario) throw noEncontrado('El usuario');
      const token = await acceso.crearEnlaceContrasena(usuario, HORAS_INVITACION * 60);
      const enlace = `${config.urlApi}/panel/restablecer.html#token=${token}&nuevo=1`;
      const enviado = await enviarInvitacion(usuario, enlace);
      await historial.registrar({ usuario: autor, entidad: 'usuario', entidadId: usuario.id, accion: 'ACTUALIZAR', resumen: `Reenvió la invitación a ${usuario.nombre}` });
      return { enlaceInvitacion: enviado ? null : enlace };
    },

    async eliminar(id, autor) {
      const usuario = await db.usuario.findUnique({ where: { id: Number(id) } });
      if (!usuario) throw noEncontrado('El usuario');
      if (usuario.id === autor.id) throw new ErrorApp(409, 'No puedes eliminar tu propio usuario.');
      if (usuario.rol === 'ADMINISTRADOR' && (await contarAdministradoresActivos(usuario.id)) === 0) {
        throw new ErrorApp(409, 'Debe quedar al menos un administrador activo.');
      }
      await db.usuario.delete({ where: { id: usuario.id } });
      await historial.registrar({ usuario: autor, entidad: 'usuario', entidadId: usuario.id, accion: 'ELIMINAR', resumen: `Eliminó el usuario ${usuario.nombre}`, antes: detalle(usuario) });
    },
  };
}
