/**
 * Secciones editables del sitio (borrador): inicio (hero), portafolio, videos,
 * testimonios, preguntas frecuentes, datos de contacto y perfiles.
 *
 * Cada sección es un «recurso» con el mismo conjunto de operaciones:
 * listar, obtener, crear, actualizar, eliminar, ordenar (arrastrar) y
 * mostrar/ocultar sin borrar. Todo cambio queda en el historial.
 * Los cambios llegan al sitio público solo al pulsar «Publicar».
 * @module servicios/contenido
 */
import { z } from 'zod';
import { ErrorApp, invalido, noEncontrado } from '../errores.js';
import { CLAVES_CATEGORIA } from '../dominio/categorias.js';
import { serializarMedio } from './medios.js';

// ─── Ayudas de validación (los formularios envían '' en campos vacíos) ────
const vacioANulo = (v) => (v === '' || v === undefined ? null : v);
const texto = (min, max, etiqueta) => z.string({ required_error: `Escribe ${etiqueta}.`, invalid_type_error: `Escribe ${etiqueta}.` })
  .trim().min(min, `${etiqueta[0].toUpperCase()}${etiqueta.slice(1)}: mínimo ${min} caracteres.`).max(max, `Máximo ${max} caracteres.`);
const textoOpcional = (max) => z.preprocess(vacioANulo, z.string().trim().max(max, `Máximo ${max} caracteres.`).nullable());
const enteroOpcional = (min, max, msg) => z.preprocess((v) => (vacioANulo(v) === null ? null : Number(v)), z.number({ invalid_type_error: msg }).int(msg).min(min, msg).max(max, msg).nullable());
const idMedio = (msg) => z.preprocess((v) => (vacioANulo(v) === null ? undefined : Number(v)), z.number({ required_error: msg, invalid_type_error: msg }).int().positive(msg));
const idMedioOpcional = z.preprocess((v) => (vacioANulo(v) === null ? null : Number(v)), z.number().int().positive().nullable());
const booleano = (porDefecto) => z.preprocess((v) => (v === 'true' || v === 'on' ? true : v === 'false' ? false : v), z.boolean().default(porDefecto));
const textoAlt = z.string({ required_error: 'Describe la imagen.' }).trim().min(8, 'Describe la imagen con al menos 8 caracteres (lo leen las personas con lector de pantalla).').max(250);

const esquemaHero = z.object({
  antetitulo: texto(2, 80, 'el antetítulo'),
  titulo: texto(5, 120, 'el título'),
  texto: texto(10, 400, 'el texto'),
  imagenId: idMedio('Elige la foto principal.'),
  imagenAlt: textoAlt,
  pieImagen: textoOpcional(140),
});

const enlaceValido = z.preprocess(vacioANulo, z.string().trim().max(300)
  .refine((v) => /^(https:\/\/|mailto:|tel:)/i.test(v), 'El enlace debe empezar por https://, mailto: o tel:').nullable());

const conFoto = (esquema) => esquema.superRefine((d, ctx) => {
  if (d.fotoId && !(d.fotoAlt && d.fotoAlt.trim().length >= 8)) {
    ctx.addIssue({ code: 'custom', path: ['fotoAlt'], message: 'Describe la foto con al menos 8 caracteres.' });
  }
});

export const RECURSOS = {
  proyectos: {
    modelo: 'proyecto', entidad: 'proyecto', singular: 'el proyecto',
    include: { imagenes: { orderBy: [{ orden: 'asc' }, { id: 'asc' }], include: { medio: true } } },
    esquema: z.object({
      titulo: texto(3, 120, 'el título'),
      categoria: z.enum(CLAVES_CATEGORIA, { errorMap: () => ({ message: 'Elige el tipo de proyecto.' }) }),
      ubicacion: textoOpcional(120),
      anio: enteroOpcional(1950, 2100, 'Escribe un año entre 1950 y 2100.'),
      area: enteroOpcional(1, 10_000_000, 'Escribe el área en m² como número entero.'),
      descripcion: texto(10, 600, 'la descripción'),
      destacado: booleano(false),
      visible: booleano(true),
      imagenes: z.array(z.object({ medioId: idMedio('Elige la foto.'), alt: textoAlt }), { required_error: 'Agrega al menos una foto.' })
        .min(1, 'Agrega al menos una foto.').max(12, 'Máximo 12 fotos por proyecto.'),
    }),
    medios: (d) => d.imagenes.map((i) => [i.medioId, 'IMAGEN']),
    titulo: (r) => r.titulo,
    serializar: (r) => ({
      id: r.id, titulo: r.titulo, categoria: r.categoria, ubicacion: r.ubicacion, anio: r.anio, area: r.area,
      descripcion: r.descripcion, destacado: r.destacado, visible: r.visible, orden: r.orden,
      imagenes: (r.imagenes ?? []).map((i) => ({ id: i.id, medioId: i.medioId, alt: i.alt, orden: i.orden, url: i.medio?.url, variantes: i.medio?.variantes ?? {} })),
      actualizado: r.actualizado,
    }),
  },
  videos: {
    modelo: 'video', entidad: 'video', singular: 'el video',
    include: { archivo: true, poster: true },
    esquema: z.object({
      titulo: texto(3, 120, 'el título'),
      etiqueta: texto(2, 40, 'la etiqueta'),
      descripcion: texto(10, 400, 'la descripción'),
      transcripcion: textoOpcional(5000),
      archivoId: idMedio('Elige el archivo de video.'),
      posterId: idMedioOpcional,
      visible: booleano(true),
    }),
    medios: (d) => [[d.archivoId, 'VIDEO'], ...(d.posterId ? [[d.posterId, 'IMAGEN']] : [])],
    titulo: (r) => r.titulo,
    serializar: (r) => ({
      id: r.id, titulo: r.titulo, etiqueta: r.etiqueta, descripcion: r.descripcion, transcripcion: r.transcripcion,
      duracionSeg: r.duracionSeg ?? (r.archivo?.duracion ? Math.round(r.archivo.duracion) : null),
      archivoId: r.archivoId, posterId: r.posterId, visible: r.visible, orden: r.orden,
      archivo: serializarMedio(r.archivo), poster: serializarMedio(r.poster),
      urlVideo: r.archivo?.url, urlPoster: r.poster?.url ?? r.archivo?.variantes?.poster ?? null,
      ancho: r.archivo?.ancho ?? null, alto: r.archivo?.alto ?? null,
    }),
  },
  testimonios: {
    modelo: 'testimonio', entidad: 'testimonio', singular: 'el testimonio',
    include: { foto: true },
    esquema: conFoto(z.object({
      nombre: texto(2, 80, 'el nombre'),
      proyecto: texto(2, 120, 'el proyecto'),
      ciudad: textoOpcional(80),
      comentario: texto(10, 600, 'el comentario'),
      fotoId: idMedioOpcional,
      fotoAlt: textoOpcional(250),
      autorizado: booleano(false),
      visible: booleano(true),
    })),
    medios: (d) => (d.fotoId ? [[d.fotoId, 'IMAGEN']] : []),
    titulo: (r) => r.nombre,
    serializar: (r) => ({
      id: r.id, nombre: r.nombre, proyecto: r.proyecto, ciudad: r.ciudad, comentario: r.comentario,
      fotoId: r.fotoId, fotoAlt: r.fotoAlt, foto: serializarMedio(r.foto), autorizado: r.autorizado, visible: r.visible, orden: r.orden,
    }),
  },
  preguntas: {
    modelo: 'preguntaFrecuente', entidad: 'pregunta', singular: 'la pregunta',
    esquema: z.object({ pregunta: texto(5, 200, 'la pregunta'), respuesta: texto(10, 1500, 'la respuesta'), visible: booleano(true) }),
    titulo: (r) => r.pregunta,
    serializar: (r) => ({ id: r.id, pregunta: r.pregunta, respuesta: r.respuesta, visible: r.visible, orden: r.orden }),
  },
  contactos: {
    modelo: 'datoContacto', entidad: 'contacto', singular: 'el dato de contacto',
    esquema: z.object({
      tipo: z.enum(['WHATSAPP', 'TELEFONO', 'CORREO', 'INSTAGRAM', 'DIRECCION', 'HORARIO', 'OTRO'], { errorMap: () => ({ message: 'Elige el tipo de dato.' }) }),
      etiqueta: texto(2, 40, 'la etiqueta'),
      valor: texto(2, 200, 'el valor'),
      enlace: enlaceValido,
      visible: booleano(true),
    }),
    titulo: (r) => `${r.etiqueta}: ${r.valor}`,
    serializar: (r) => ({ id: r.id, tipo: r.tipo, etiqueta: r.etiqueta, valor: r.valor, enlace: r.enlace, visible: r.visible, orden: r.orden }),
  },
  perfiles: {
    modelo: 'perfil', entidad: 'perfil', singular: 'el perfil',
    include: { foto: true },
    esquema: conFoto(z.object({
      nombre: texto(3, 80, 'el nombre'),
      cargo: texto(3, 80, 'el cargo'),
      lema: textoOpcional(160),
      mision: textoOpcional(800),
      formacion: texto(5, 400, 'la formación'),
      trayectoria: texto(5, 600, 'la trayectoria'),
      experiencia: textoOpcional(600),
      fotoId: idMedioOpcional,
      fotoAlt: textoOpcional(250),
      visible: booleano(true),
    })),
    medios: (d) => (d.fotoId ? [[d.fotoId, 'IMAGEN']] : []),
    titulo: (r) => r.nombre,
    serializar: (r) => ({
      id: r.id, nombre: r.nombre, cargo: r.cargo, lema: r.lema, mision: r.mision, formacion: r.formacion,
      trayectoria: r.trayectoria, experiencia: r.experiencia, fotoId: r.fotoId, fotoAlt: r.fotoAlt,
      foto: serializarMedio(r.foto), visible: r.visible, orden: r.orden,
    }),
  },
};

export const serializarHero = (h) => (h ? {
  antetitulo: h.antetitulo, titulo: h.titulo, texto: h.texto, imagenId: h.imagenId, imagenAlt: h.imagenAlt,
  pieImagen: h.pieImagen, imagen: serializarMedio(h.imagen), actualizado: h.actualizado,
} : null);

export function crearServicioContenido({ db, historial }) {
  function recurso(nombre) {
    const r = RECURSOS[nombre];
    if (!r) throw noEncontrado('La sección');
    return r;
  }

  async function validarMedios(lista) {
    for (const [id, tipo] of lista) {
      const medio = await db.medio.findUnique({ where: { id } });
      if (!medio || medio.tipo !== tipo) throw invalido(tipo === 'VIDEO' ? 'El video elegido no existe.' : 'La foto elegida no existe.');
      if (medio.estado !== 'LISTO') throw invalido(medio.estado === 'PROCESANDO' ? 'El video todavía se está procesando. Espera a que diga «Listo».' : 'El archivo elegido tuvo un error al procesarse. Súbelo de nuevo.');
    }
  }

  async function obtener(nombre, id) {
    const r = recurso(nombre);
    const fila = await db[r.modelo].findUnique({ where: { id: Number(id) }, include: r.include });
    if (!fila) throw noEncontrado(r.singular[0].toUpperCase() + r.singular.slice(1));
    return r.serializar(fila);
  }

  async function guardarImagenes(proyectoId, imagenes) {
    await db.imagenProyecto.deleteMany({ where: { proyectoId } });
    for (const [orden, img] of imagenes.entries()) {
      await db.imagenProyecto.create({ data: { proyectoId, medioId: img.medioId, alt: img.alt, orden } });
    }
  }

  const api = {
    recursos: Object.keys(RECURSOS),

    async listar(nombre) {
      const r = recurso(nombre);
      const filas = await db[r.modelo].findMany({ orderBy: [{ orden: 'asc' }, { id: 'asc' }], include: r.include });
      return filas.map(r.serializar);
    },

    obtener,

    async crear(nombre, datos, usuario) {
      const r = recurso(nombre);
      const valores = r.esquema.parse(datos);
      if (r.medios) await validarMedios(r.medios(valores));
      const ultimo = await db[r.modelo].findFirst({ orderBy: { orden: 'desc' } });
      const { imagenes, ...campos } = valores;
      if (r.modelo === 'video') campos.duracionSeg = await duracionDe(campos.archivoId);
      const fila = await db.$transaction(async (tx) => {
        const creada = await tx[r.modelo].create({ data: { ...campos, orden: (ultimo?.orden ?? -1) + 1 } });
        if (imagenes) await guardarImagenes(creada.id, imagenes);
        return creada;
      });
      const resultado = await obtener(nombre, fila.id);
      await historial.registrar({ usuario, entidad: r.entidad, entidadId: fila.id, accion: 'CREAR', resumen: `Creó ${r.singular} «${r.titulo(resultado)}»`, despues: resultado });
      return resultado;
    },

    async actualizar(nombre, id, datos, usuario) {
      const r = recurso(nombre);
      const antes = await obtener(nombre, id);
      const valores = r.esquema.parse(datos);
      if (r.medios) await validarMedios(r.medios(valores));
      const { imagenes, ...campos } = valores;
      if (r.modelo === 'video') campos.duracionSeg = await duracionDe(campos.archivoId);
      await db.$transaction(async (tx) => {
        await tx[r.modelo].update({ where: { id: antes.id }, data: campos });
        if (imagenes) await guardarImagenes(antes.id, imagenes);
      });
      const despues = await obtener(nombre, id);
      await historial.registrar({ usuario, entidad: r.entidad, entidadId: antes.id, accion: 'ACTUALIZAR', resumen: `Editó ${r.singular} «${r.titulo(despues)}»`, antes, despues });
      return despues;
    },

    async eliminar(nombre, id, usuario) {
      const r = recurso(nombre);
      const antes = await obtener(nombre, id);
      await db[r.modelo].delete({ where: { id: antes.id } });
      await historial.registrar({ usuario, entidad: r.entidad, entidadId: antes.id, accion: 'ELIMINAR', resumen: `Eliminó ${r.singular} «${r.titulo(antes)}»`, antes });
    },

    /** Guarda el nuevo orden (lista completa de ids en el orden deseado). */
    async ordenar(nombre, ids, usuario) {
      const r = recurso(nombre);
      const lista = z.array(z.coerce.number().int().positive()).parse(ids);
      const actuales = await db[r.modelo].findMany({ orderBy: [{ orden: 'asc' }, { id: 'asc' }] });
      const mismos = actuales.length === lista.length && actuales.every((f) => lista.includes(f.id)) && new Set(lista).size === lista.length;
      if (!mismos) throw new ErrorApp(409, 'La lista cambió mientras la ordenabas. Recarga la página e inténtalo de nuevo.');
      await db.$transaction(async (tx) => {
        for (const [orden, idFila] of lista.entries()) await tx[r.modelo].update({ where: { id: idFila }, data: { orden } });
      });
      await historial.registrar({ usuario, entidad: r.entidad, accion: 'ORDENAR', resumen: `Cambió el orden de ${nombre}`, antes: actuales.map((f) => f.id), despues: lista });
      return api.listar(nombre);
    },

    async cambiarVisibilidad(nombre, id, visible, usuario) {
      const r = recurso(nombre);
      const antes = await obtener(nombre, id);
      await db[r.modelo].update({ where: { id: antes.id }, data: { visible: Boolean(visible) } });
      const despues = await obtener(nombre, id);
      await historial.registrar({ usuario, entidad: r.entidad, entidadId: antes.id, accion: 'ACTUALIZAR', resumen: `${visible ? 'Mostró' : 'Ocultó'} ${r.singular} «${r.titulo(despues)}»`, antes: { visible: antes.visible }, despues: { visible: despues.visible } });
      return despues;
    },

    // ─── Inicio (hero): un solo registro ───
    async obtenerHero() {
      return serializarHero(await db.hero.findUnique({ where: { id: 1 }, include: { imagen: true } }));
    },

    async actualizarHero(datos, usuario) {
      const valores = esquemaHero.parse(datos);
      await validarMedios([[valores.imagenId, 'IMAGEN']]);
      const antes = await api.obtenerHero();
      await db.hero.upsert({ where: { id: 1 }, update: valores, create: { id: 1, ...valores } });
      const despues = await api.obtenerHero();
      await historial.registrar({ usuario, entidad: 'hero', entidadId: 1, accion: 'ACTUALIZAR', resumen: 'Editó la sección de inicio', antes, despues });
      return despues;
    },
  };
  return api;

  async function duracionDe(archivoId) {
    const medio = await db.medio.findUnique({ where: { id: archivoId } });
    return medio?.duracion ? Math.round(medio.duracion) : null;
  }
}
