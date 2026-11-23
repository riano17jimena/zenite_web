/**
 * Crea el primer administrador (o cualquier usuario) desde la terminal y envía
 * por correo el enlace para que elija su contraseña.
 * Uso: npm run usuario:crear -- --nombre "Daniel Brand" --correo zeniteark@gmail.com --rol ADMINISTRADOR
 */
import { parseArgs } from 'node:util';
import { crearServicios } from '../src/app.js';
import { cargarConfiguracion } from '../src/config.js';
import { crearDb } from '../src/db.js';
import { cifrarContrasena, tokenAleatorio } from '../src/seguridad/criptografia.js';

const { values } = parseArgs({ options: { nombre: { type: 'string' }, correo: { type: 'string' }, rol: { type: 'string', default: 'ADMINISTRADOR' } } });
if (!values.nombre || !values.correo || !['ADMINISTRADOR', 'EDITOR'].includes(values.rol)) {
  console.error('Uso: npm run usuario:crear -- --nombre "Nombre" --correo correo@dominio.com [--rol ADMINISTRADOR|EDITOR]');
  process.exit(1);
}
const config = cargarConfiguracion();
const db = await crearDb(config);
const { acceso, correo } = crearServicios({ db, config });
try {
  const correoNormal = values.correo.trim().toLowerCase();
  let usuario = await db.usuario.findUnique({ where: { correo: correoNormal } });
  if (!usuario) {
    usuario = await db.usuario.create({ data: { nombre: values.nombre.trim(), correo: correoNormal, rol: values.rol, hashContrasena: await cifrarContrasena(tokenAleatorio(24)) } });
  }
  const token = await acceso.crearEnlaceContrasena(usuario, 72 * 60);
  const url = `${config.urlApi}/panel/restablecer.html#token=${token}&nuevo=1`;
  await correo.invitacion(usuario, url, 72);
  console.log(`Usuario ${usuario.correo} (${usuario.rol}) listo.`);
  console.log(correo.simulado ? `Correo no configurado. Abre este enlace para crear la contraseña (vence en 72 h):\n${url}` : 'Le enviamos el enlace para crear su contraseña.');
} finally {
  await db.$disconnect?.();
}
