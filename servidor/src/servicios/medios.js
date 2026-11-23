/**
 * Biblioteca de fotos y videos del panel.
 * - Las fotos se convierten a WebP al subirlas y exigen texto alternativo.
 * - Los videos se comprimen en segundo plano (estado PROCESANDO → LISTO).
 * - Un archivo en uso no se puede eliminar: el panel indica dónde se usa.
 * @module servicios/medios
 */
import { ErrorApp, invalido, noEncontrado } from '../errores.js';
import { tokenAleatorio } from '../seguridad/criptografia.js';
import { procesarImagen, procesarVideo, TIPOS_IMAGEN, TIPOS_VIDEO } from './procesamiento.js';

const ALT_MINIMO = 8;

export const serializarMedio = (m) => (m ? {
  id: m.id, tipo: m.tipo, url: m.url, mime: m.mime, bytes: m.bytes, ancho: m.ancho, alto: m.alto,
  duracion: m.duracion, alt: m.alt, nombre: m.nombre, estado: m.estado, error: m.error,
  variantes: m.variantes ?? {}, creado: m.creado,
} : null);

function nombreSeguro(nombre) {
  return String(nombre || 'archivo').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\.[^.]+$/, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'archivo';
}

export function crearServicioMedios({ db, config, almacenamiento, historial }) {
  async function usos(id) {
    const [hero, imagenes, videos, posters, testimonios, perfiles] = await Promise.all([
      db.hero.findMany({ where: { imagenId: id } }),
      db.imagenProyecto.findMany({ where: { medioId: id }, include: { proyecto: true } }),
      db.video.findMany({ where: { archivoId: id } }),
      db.video.findMany({ where: { posterId: id } }),
      db.testimonio.findMany({ where: { fotoId: id } }),
      db.perfil.findMany({ where: { fotoId: id } }),
    ]);
    return [
      ...hero.map(() => 'Inicio (foto principal)'),
      ...imagenes.map((i) => `Portafolio: ${i.proyecto.titulo}`),
      ...videos.map((v) => `Video: ${v.titulo}`),
      ...posters.map((v) => `Portada del video: ${v.titulo}`),
      ...testimonios.map((t) => `Testimonio: ${t.nombre}`),
      ...perfiles.map((p) => `Perfil: ${p.nombre}`),
    ];
  }

  async function procesarVideoEnSegundoPlano(medio, contenido, prefijo) {
    try {
      const r = await procesarVideo(contenido);
      const claveVideo = `${prefijo}.mp4`;
      const clavePoster = `${prefijo}-portada.webp`;
      const url = await almacenamiento.guardar(claveVideo, r.video, 'video/mp4');
      const poster = await almacenamiento.guardar(clavePoster, r.poster, 'image/webp');
      await db.medio.update({
        where: { id: medio.id },
        data: { clave: claveVideo, url, mime: 'video/mp4', bytes: r.video.length, ancho: r.ancho, alto: r.alto, duracion: r.duracion, estado: 'LISTO', variantes: { poster, clavePoster } },
      });
    } catch (error) {
      console.error('Error al procesar video', error);
      await db.medio.update({ where: { id: medio.id }, data: { estado: 'ERROR', error: 'No pudimos procesar el video. Prueba con un MP4 de menos de 50 MB.' } }).catch(() => {});
    }
  }

  return {
    usos,

    /**
     * @param {{contenido:Buffer, mime:string, nombre:string, alt?:string}} archivo
     */
    async subir({ contenido, mime, nombre, alt }, usuario) {
      if (!Buffer.isBuffer(contenido) || contenido.length === 0) throw invalido('No recibimos ningún archivo.');
      const fecha = new Date();
      const prefijo = `${fecha.getFullYear()}/${String(fecha.getMonth() + 1).padStart(2, '0')}/${nombreSeguro(nombre)}-${tokenAleatorio(6)}`;

      if (TIPOS_IMAGEN.includes(mime)) {
        if (contenido.length > config.limites.imagenBytes) throw invalido('La foto pesa más de 10 MB. Redúcela e inténtalo de nuevo.');
        const textoAlt = String(alt ?? '').trim();
        if (textoAlt.length < ALT_MINIMO) {
          throw invalido('Describe la foto para las personas que usan lector de pantalla.', { alt: `Escribe al menos ${ALT_MINIMO} caracteres que describan lo que se ve en la foto.` });
        }
        let r;
        try { r = await procesarImagen(contenido); } catch (e) { throw invalido(e.message); }
        const clave = `${prefijo}.webp`;
        const url = await almacenamiento.guardar(clave, r.principal, 'image/webp');
        const url960 = await almacenamiento.guardar(`${prefijo}-960.webp`, r.variantes[960], 'image/webp');
        const medio = await db.medio.create({
          data: { tipo: 'IMAGEN', clave, url, mime: 'image/webp', bytes: r.principal.length, ancho: r.ancho, alto: r.alto, alt: textoAlt, nombre: String(nombre).slice(0, 120), variantes: { 960: url960, clave960: `${prefijo}-960.webp` } },
        });
        await historial.registrar({ usuario, entidad: 'medio', entidadId: medio.id, accion: 'CREAR', resumen: `Subió la foto «${medio.nombre}»` });
        return serializarMedio(medio);
      }

      if (TIPOS_VIDEO.includes(mime)) {
        if (contenido.length > config.limites.videoBytes) throw invalido('El video pesa más de 50 MB. Recórtalo o comprímelo e inténtalo de nuevo.');
        const medio = await db.medio.create({
          data: { tipo: 'VIDEO', clave: `${prefijo}.pendiente`, url: '', mime, bytes: contenido.length, nombre: String(nombre).slice(0, 120), estado: 'PROCESANDO', alt: alt ? String(alt).trim() : null },
        });
        await historial.registrar({ usuario, entidad: 'medio', entidadId: medio.id, accion: 'CREAR', resumen: `Subió el video «${medio.nombre}»` });
        // Se responde de inmediato; el panel consulta el estado hasta que quede LISTO.
        setImmediate(() => procesarVideoEnSegundoPlano(medio, contenido, prefijo));
        return serializarMedio(medio);
      }

      throw invalido('Formato no permitido. Sube fotos JPG, PNG o WebP, o videos MP4, MOV o WebM.');
    },

    async listar({ tipo } = {}) {
      const medios = await db.medio.findMany({ where: tipo ? { tipo } : {}, orderBy: [{ creado: 'desc' }, { id: 'desc' }] });
      return medios.map(serializarMedio);
    },

    async obtener(id) {
      const medio = await db.medio.findUnique({ where: { id: Number(id) } });
      if (!medio) throw noEncontrado('El archivo');
      return { ...serializarMedio(medio), usos: await usos(medio.id) };
    },

    async actualizarAlt(id, alt, usuario) {
      const texto = String(alt ?? '').trim();
      const medio = await db.medio.findUnique({ where: { id: Number(id) } });
      if (!medio) throw noEncontrado('El archivo');
      if (medio.tipo === 'IMAGEN' && texto.length < ALT_MINIMO) {
        throw invalido('El texto alternativo es obligatorio.', { alt: `Escribe al menos ${ALT_MINIMO} caracteres.` });
      }
      const actualizado = await db.medio.update({ where: { id: medio.id }, data: { alt: texto } });
      await historial.registrar({ usuario, entidad: 'medio', entidadId: medio.id, accion: 'ACTUALIZAR', resumen: `Cambió la descripción de «${medio.nombre}»`, antes: { alt: medio.alt }, despues: { alt: texto } });
      return serializarMedio(actualizado);
    },

    async eliminar(id, usuario) {
      const medio = await db.medio.findUnique({ where: { id: Number(id) } });
      if (!medio) throw noEncontrado('El archivo');
      const enUso = await usos(medio.id);
      if (enUso.length) throw new ErrorApp(409, `No se puede eliminar porque se usa en: ${enUso.join('; ')}.`);
      await db.medio.delete({ where: { id: medio.id } });
      const v = medio.variantes ?? {};
      await almacenamiento.eliminar([medio.clave, v.clave960, v.clavePoster]).catch((e) => console.error('No se pudo borrar del almacenamiento', e));
      await historial.registrar({ usuario, entidad: 'medio', entidadId: medio.id, accion: 'ELIMINAR', resumen: `Eliminó «${medio.nombre}»`, antes: serializarMedio(medio) });
    },

    /** Registra un archivo ya optimizado (se usa al migrar el contenido actual). */
    async registrarExistente({ contenido, clave, mime, tipo, nombre, alt, ancho, alto, duracion, variantes }) {
      const url = await almacenamiento.guardar(clave, contenido, mime);
      return db.medio.create({ data: { tipo, clave, url, mime, bytes: contenido.length, nombre, alt: alt ?? null, ancho: ancho ?? null, alto: alto ?? null, duracion: duracion ?? null, variantes: variantes ?? null } });
    },
  };
}
