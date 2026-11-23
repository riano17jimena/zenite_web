/**
 * Borrador, vista previa y publicación.
 *
 * Lo que se edita en el panel es un borrador. «Publicar» guarda una copia
 * completa del contenido (versión numerada) y el sitio público lee siempre
 * la última versión publicada. Cualquier versión anterior se puede volver a
 * publicar («Restaurar»).
 * @module servicios/publicacion
 */
import { ErrorApp, noEncontrado } from '../errores.js';
import { firmar, sha256, verificarFirma } from '../seguridad/criptografia.js';

const SEGUNDOS_VISTA_PREVIA = 30 * 60;

/** Quita marcas de tiempo e identificadores internos que no cambian el contenido visible. */
function sinMarcas(valor) {
  if (Array.isArray(valor)) return valor.map(sinMarcas);
  if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    return Object.fromEntries(Object.entries(valor).filter(([k]) => !['actualizado', 'creado'].includes(k)).map(([k, v]) => [k, sinMarcas(v)]));
  }
  return valor;
}

function ordenarClaves(valor) {
  if (Array.isArray(valor)) return valor.map(ordenarClaves);
  if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    return Object.fromEntries(Object.keys(valor).sort().map((k) => [k, ordenarClaves(valor[k])]));
  }
  return valor;
}

export const huella = (contenido) => sha256(JSON.stringify(ordenarClaves(sinMarcas(contenido))));

const imagenPublica = (m, alt) => (m ? { url: m.url, url960: m.variantes?.[960] ?? null, ancho: m.ancho, alto: m.alto, alt: alt ?? m.alt } : null);

export function crearServicioPublicacion({ db, config, contenido, historial }) {
  let cache = null;

  /** Contenido actual del borrador con el formato que usa el sitio público. */
  async function construirBorrador() {
    const [hero, proyectos, videos, testimonios, preguntas, contactos, perfiles] = await Promise.all([
      contenido.obtenerHero(),
      contenido.listar('proyectos'),
      contenido.listar('videos'),
      contenido.listar('testimonios'),
      contenido.listar('preguntas'),
      contenido.listar('contactos'),
      contenido.listar('perfiles'),
    ]);
    const visibles = (lista) => lista.filter((x) => x.visible);
    return sinMarcas({
      hero: hero && { antetitulo: hero.antetitulo, titulo: hero.titulo, texto: hero.texto, pieImagen: hero.pieImagen, imagen: imagenPublica(hero.imagen, hero.imagenAlt) },
      proyectos: visibles(proyectos).map((p) => ({
        id: p.id, titulo: p.titulo, categoria: p.categoria, ubicacion: p.ubicacion, anio: p.anio, area: p.area,
        descripcion: p.descripcion, destacado: p.destacado,
        imagenes: p.imagenes.map((i) => ({ url: i.url, url960: i.variantes?.[960] ?? null, alt: i.alt })),
      })),
      videos: visibles(videos).filter((v) => v.archivo?.estado === 'LISTO').map((v) => ({
        id: v.id, titulo: v.titulo, etiqueta: v.etiqueta, descripcion: v.descripcion, transcripcion: v.transcripcion,
        duracionSeg: v.duracionSeg, url: v.urlVideo, poster: v.urlPoster, ancho: v.ancho, alto: v.alto,
      })),
      testimonios: visibles(testimonios).filter((t) => t.autorizado).map((t) => ({
        id: t.id, nombre: t.nombre, proyecto: t.proyecto, ciudad: t.ciudad, comentario: t.comentario, foto: imagenPublica(t.foto, t.fotoAlt),
      })),
      preguntas: visibles(preguntas).map((q) => ({ id: q.id, pregunta: q.pregunta, respuesta: q.respuesta })),
      contactos: visibles(contactos).map((c) => ({ tipo: c.tipo, etiqueta: c.etiqueta, valor: c.valor, enlace: c.enlace })),
      perfiles: visibles(perfiles).map((p) => ({
        nombre: p.nombre, cargo: p.cargo, lema: p.lema, mision: p.mision, formacion: p.formacion,
        trayectoria: p.trayectoria, experiencia: p.experiencia, foto: imagenPublica(p.foto, p.fotoAlt),
      })),
    });
  }

  async function ultima() {
    return db.publicacion.findFirst({ orderBy: { version: 'desc' }, include: { publicadaPor: { select: { id: true, nombre: true } } } });
  }

  async function guardarVersion({ contenido: datos, nota, restauradaDe = null }, usuario) {
    const anterior = await ultima();
    const version = (anterior?.version ?? 0) + 1;
    const publicacion = await db.publicacion.create({ data: { version, contenido: datos, nota: nota?.slice(0, 200) || null, restauradaDe, publicadaPorId: usuario?.id ?? null } });
    cache = null;
    return publicacion;
  }

  return {
    construirBorrador,

    async estado() {
      const [borrador, publicada] = await Promise.all([construirBorrador(), ultima()]);
      return {
        hayCambios: !publicada || huella(borrador) !== huella(publicada.contenido),
        ultima: publicada ? { version: publicada.version, publicada: publicada.publicada, por: publicada.publicadaPor?.nombre ?? null, nota: publicada.nota } : null,
      };
    },

    async publicar({ nota } = {}, usuario) {
      const borrador = await construirBorrador();
      const publicacion = await guardarVersion({ contenido: borrador, nota }, usuario);
      await historial.registrar({ usuario, entidad: 'publicacion', entidadId: publicacion.version, accion: 'PUBLICAR', resumen: `Publicó la versión ${publicacion.version}${nota ? `: ${nota}` : ''}` });
      return { version: publicacion.version, publicada: publicacion.publicada };
    },

    async listar() {
      const lista = await db.publicacion.findMany({ orderBy: { version: 'desc' }, take: 50, include: { publicadaPor: { select: { nombre: true } } } });
      return lista.map((p) => ({ id: p.id, version: p.version, nota: p.nota, publicada: p.publicada, por: p.publicadaPor?.nombre ?? null, restauradaDe: p.restauradaDe }));
    },

    /** Vuelve a publicar una versión anterior (el borrador no cambia). */
    async restaurar(id, usuario) {
      const vieja = await db.publicacion.findUnique({ where: { id: Number(id) } });
      if (!vieja) throw noEncontrado('La versión');
      const actual = await ultima();
      if (actual?.id === vieja.id) throw new ErrorApp(409, 'Esa versión ya es la que está publicada.');
      const nueva = await guardarVersion({ contenido: vieja.contenido, nota: `Restaurada desde la versión ${vieja.version}`, restauradaDe: vieja.version }, usuario);
      await historial.registrar({ usuario, entidad: 'publicacion', entidadId: nueva.version, accion: 'RESTAURAR', resumen: `Volvió a publicar el contenido de la versión ${vieja.version}` });
      return { version: nueva.version };
    },

    /** Lo que ve el sitio público. Se guarda en memoria hasta la próxima publicación. */
    async publicado() {
      if (cache && Date.now() - cache.leido < 60_000) return cache.datos;
      const p = await ultima();
      const datos = p ? { version: p.version, publicada: p.publicada, ...p.contenido } : null;
      cache = { datos, leido: Date.now() };
      return datos;
    },

    crearTokenVistaPrevia: (usuario) => firmar({ uso: 'vista-previa', u: usuario.id }, config.secreto, SEGUNDOS_VISTA_PREVIA),
    tokenVistaPreviaValido: (token) => verificarFirma(token, config.secreto)?.uso === 'vista-previa',
    urlVistaPrevia(token) {
      return `${config.urlSitio.replace(/\/+$/, '')}/?vista-previa=${encodeURIComponent(token)}`;
    },
  };
}
