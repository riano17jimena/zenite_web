/**
 * Carga inicial de datos (migración del sitio actual a la base de datos):
 * - Contenido: textos, portafolio, videos, testimonios, preguntas, contacto y
 *   perfil, con sus fotos y videos subidos al almacenamiento.
 * - Base de precios del Excel (capítulos, actividades, insumos y APU).
 * - Servicios de consultoría y financieros, y configuración del cotizador.
 * Cada paso se omite si ya tiene datos, así que se puede ejecutar varias veces.
 * @module servicios/semilla
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { procesarImagen } from './procesamiento.js';

const TROZO = 1000;
const leerJson = async (ruta) => JSON.parse(await readFile(ruta, 'utf8'));

async function enTrozos(lista, accion) {
  for (let i = 0; i < lista.length; i += TROZO) await accion(lista.slice(i, i + TROZO));
}

export async function sembrarContenido({ db, medios, almacenamiento, rutaDatos, raiz }) {
  if (await db.hero.findUnique({ where: { id: 1 } })) return { omitido: true };
  const datos = await leerJson(rutaDatos);
  const desde = (relativa) => path.resolve(raiz, relativa);
  const cacheImagenes = new Map();

  async function imagen(relativa, alt) {
    if (cacheImagenes.has(relativa)) return cacheImagenes.get(relativa);
    const contenido = await readFile(desde(relativa));
    const r = await procesarImagen(contenido);
    const base = `inicial/${path.basename(relativa, path.extname(relativa))}`;
    const url960 = await almacenamiento.guardar(`${base}-960.webp`, r.variantes[960], 'image/webp');
    const medio = await medios.registrarExistente({
      contenido: r.principal, clave: `${base}.webp`, mime: 'image/webp', tipo: 'IMAGEN', nombre: path.basename(relativa),
      alt, ancho: r.ancho, alto: r.alto, variantes: { 960: url960, clave960: `${base}-960.webp` },
    });
    cacheImagenes.set(relativa, medio.id);
    return medio.id;
  }

  const h = datos.hero;
  await db.hero.create({ data: { id: 1, antetitulo: h.antetitulo, titulo: h.titulo, texto: h.texto, imagenAlt: h.imagenAlt, pieImagen: h.pieImagen, imagenId: await imagen(h.imagen, h.imagenAlt) } });

  for (const [orden, p] of datos.proyectos.entries()) {
    const proyecto = await db.proyecto.create({ data: { titulo: p.titulo, categoria: p.categoria, ubicacion: p.ubicacion, anio: p.anio, area: p.area, descripcion: p.descripcion, destacado: p.destacado, orden } });
    for (const [i, img] of p.imagenes.entries()) {
      await db.imagenProyecto.create({ data: { proyectoId: proyecto.id, medioId: await imagen(img.archivo, img.alt), alt: img.alt, orden: i } });
    }
  }

  for (const [orden, v] of datos.videos.entries()) {
    const poster = await imagen(v.poster, `Portada del video ${v.titulo}`);
    const contenido = await readFile(desde(v.archivo));
    const posterMedio = await db.medio.findUnique({ where: { id: poster } });
    const archivo = await medios.registrarExistente({
      contenido, clave: `inicial/${path.basename(v.archivo)}`, mime: 'video/mp4', tipo: 'VIDEO', nombre: path.basename(v.archivo),
      duracion: v.duracionSeg, ancho: posterMedio.ancho, alto: posterMedio.alto, variantes: { poster: posterMedio.url, clavePoster: posterMedio.clave },
    });
    await db.video.create({ data: { titulo: v.titulo, etiqueta: v.etiqueta, descripcion: v.descripcion, transcripcion: v.transcripcion, duracionSeg: v.duracionSeg, archivoId: archivo.id, posterId: poster, orden } });
  }

  for (const [orden, t] of datos.testimonios.entries()) await db.testimonio.create({ data: { ...t, orden } });
  for (const [orden, q] of datos.preguntas.entries()) await db.preguntaFrecuente.create({ data: { ...q, orden } });
  for (const [orden, c] of datos.contactos.entries()) await db.datoContacto.create({ data: { ...c, orden } });
  for (const [orden, p] of datos.perfiles.entries()) {
    const { foto, ...resto } = p;
    await db.perfil.create({ data: { ...resto, fotoId: foto ? await imagen(foto, p.fotoAlt) : null, orden } });
  }
  return { omitido: false };
}

export async function sembrarCotizador({ db, rutaDatos, carpetaPrivada }) {
  const datos = await leerJson(rutaDatos);
  if (!(await db.configuracionCotizador.findUnique({ where: { id: 1 } }))) {
    const aiuRuta = path.join(carpetaPrivada, 'aiu.json');
    const aiu = existsSync(aiuRuta) ? await leerJson(aiuRuta) : {};
    await db.configuracionCotizador.create({
      data: {
        id: 1, ...datos.configuracion,
        administracion: aiu['Administración'] ?? 0.1, imprevistos: aiu.Imprevistos ?? 0.05,
        utilidad: aiu.Utilidad ?? 0.05, ivaSobreUtilidad: aiu['IVA sobre Utilidad'] ?? 0.19,
      },
    });
  }
  if ((await db.servicioCatalogo.count()) === 0) {
    await db.servicioCatalogo.createMany({ data: datos.servicios.map((s, orden) => ({ ...s, provisional: true, orden })) });
  }

  const resultado = { capitulos: 0, actividades: 0, insumos: 0, componentes: 0 };
  if ((await db.capitulo.count()) > 0 || !existsSync(path.join(carpetaPrivada, 'actividades.json'))) return resultado;

  const [capitulos, actividades, insumos, apu, auxiliares] = await Promise.all(
    ['capitulos', 'actividades', 'insumos', 'apu', 'auxiliares'].map((n) => leerJson(path.join(carpetaPrivada, `${n}.json`))),
  );
  await db.capitulo.createMany({ data: capitulos.map((c) => ({ codigo: c.codigo, nombre: c.nombre, orden: c.orden })) });
  const idCapitulo = new Map((await db.capitulo.findMany({})).map((c) => [c.codigo, c.id]));
  await enTrozos(actividades, (lote) => db.actividad.createMany({
    data: lote.map((a) => ({ codigo: a.codigo, capituloId: idCapitulo.get(a.capitulo), subcapitulo: a.subcapitulo ?? null, descripcion: a.descripcion, unidad: a.unidad, precioUnitario: a.precio })),
  }));
  await enTrozos(insumos, (lote) => db.insumo.createMany({ data: lote.map((i) => ({ clave: i.clave, descripcion: i.descripcion, unidad: i.unidad, tipo: i.tipo, precio: i.precio })) }));
  const idActividad = new Map((await db.actividad.findMany({})).map((a) => [a.codigo, a.id]));
  const idInsumo = new Map((await db.insumo.findMany({})).map((i) => [i.clave, i.id]));

  const filas = [];
  const agregar = (componentes, dueno) => componentes.forEach((c, orden) => filas.push({
    ...dueno, insumoId: c.insumo ? idInsumo.get(c.insumo) ?? null : null, grupo: c.grupo, descripcion: c.descripcion,
    unidad: c.unidad, cantidad: c.cantidad, precio: c.precio, porcentaje: c.porcentaje, orden,
  }));
  for (const b of apu) if (idActividad.has(b.codigo)) agregar(b.componentes, { actividadId: idActividad.get(b.codigo), auxiliarId: null });
  for (const b of auxiliares) if (idInsumo.has(b.clave)) agregar(b.componentes, { actividadId: null, auxiliarId: idInsumo.get(b.clave) });
  await enTrozos(filas, (lote) => db.componenteApu.createMany({ data: lote }));

  return { capitulos: capitulos.length, actividades: actividades.length, insumos: insumos.length, componentes: filas.length };
}
