/**
 * API del panel. Requiere sesión.
 * Permisos:
 *  - EDITOR y ADMINISTRADOR: contenido (inicio, portafolio, videos, testimonios,
 *    preguntas, contacto, perfil), biblioteca de medios y vista previa.
 *  - Solo ADMINISTRADOR: publicar y restaurar versiones, precios del cotizador,
 *    solicitudes y cotizaciones (datos personales), usuarios, historial y respaldos.
 * @module rutas/admin
 */
import express from 'express';
import { asincrono, exigirRol, exigirSesion } from '../middleware/index.js';

const ADMIN = 'ADMINISTRADOR';
const EDITOR = 'EDITOR';

const decodificar = (valor) => {
  try { return decodeURIComponent(String(valor ?? '')); } catch { return String(valor ?? ''); }
};

export function rutasAdmin({ servicios, config }) {
  const { contenido, medios, publicacion, cotizador, solicitudes, usuarios, historial, respaldo } = servicios;
  const r = express.Router();
  const todos = exigirRol(ADMIN, EDITOR);
  const soloAdmin = exigirRol(ADMIN);
  r.use(exigirSesion);
  r.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  // ─── Resumen del tablero ──────────────────────────────────────────────
  r.get('/resumen', todos, asincrono(async (req, res) => {
    const [estado, conteos] = await Promise.all([
      publicacion.estado(),
      Promise.all(contenido.recursos.map(async (n) => [n, (await contenido.listar(n)).length])),
    ]);
    const datos = { publicacion: estado, secciones: Object.fromEntries(conteos) };
    if (req.usuario.rol === ADMIN) {
      const s = await solicitudes.listar({ pagina: 1, porPagina: 5 });
      datos.solicitudes = { nuevas: s.nuevas, total: s.total, recientes: s.solicitudes };
    }
    res.json(datos);
  }));

  // ─── Inicio (hero) ────────────────────────────────────────────────────
  r.get('/hero', todos, asincrono(async (req, res) => res.json(await contenido.obtenerHero())));
  r.put('/hero', todos, asincrono(async (req, res) => res.json(await contenido.actualizarHero(req.body, req.usuario))));

  // ─── Secciones con CRUD, orden y visibilidad ─────────────────────────
  for (const nombre of contenido.recursos) {
    const base = `/${nombre}`;
    r.get(base, todos, asincrono(async (req, res) => res.json(await contenido.listar(nombre))));
    r.post(base, todos, asincrono(async (req, res) => res.status(201).json(await contenido.crear(nombre, req.body, req.usuario))));
    r.put(`${base}/orden`, todos, asincrono(async (req, res) => res.json(await contenido.ordenar(nombre, req.body?.ids, req.usuario))));
    r.get(`${base}/:id`, todos, asincrono(async (req, res) => res.json(await contenido.obtener(nombre, req.params.id))));
    r.put(`${base}/:id`, todos, asincrono(async (req, res) => res.json(await contenido.actualizar(nombre, req.params.id, req.body, req.usuario))));
    r.patch(`${base}/:id/visible`, todos, asincrono(async (req, res) => res.json(await contenido.cambiarVisibilidad(nombre, req.params.id, req.body?.visible, req.usuario))));
    r.delete(`${base}/:id`, todos, asincrono(async (req, res) => { await contenido.eliminar(nombre, req.params.id, req.usuario); res.status(204).end(); }));
  }

  // ─── Biblioteca de fotos y videos ─────────────────────────────────────
  const cuerpoArchivo = express.raw({ type: () => true, limit: config.limites.videoBytes + 1024 });
  r.get('/medios', todos, asincrono(async (req, res) => res.json(await medios.listar({ tipo: req.query.tipo }))));
  r.post('/medios', todos, cuerpoArchivo, asincrono(async (req, res) => {
    const medio = await medios.subir({
      contenido: req.body,
      mime: String(req.get('content-type') ?? '').split(';')[0].trim().toLowerCase(),
      nombre: decodificar(req.get('x-nombre-archivo')),
      alt: decodificar(req.get('x-texto-alternativo')),
    }, req.usuario);
    res.status(201).json(medio);
  }));
  r.get('/medios/:id', todos, asincrono(async (req, res) => res.json(await medios.obtener(Number(req.params.id)))));
  r.patch('/medios/:id', todos, asincrono(async (req, res) => res.json(await medios.actualizarAlt(Number(req.params.id), req.body?.alt, req.usuario))));
  r.delete('/medios/:id', todos, asincrono(async (req, res) => { await medios.eliminar(Number(req.params.id), req.usuario); res.status(204).end(); }));

  // ─── Borrador, vista previa y publicación ─────────────────────────────
  r.get('/publicacion/estado', todos, asincrono(async (req, res) => res.json(await publicacion.estado())));
  r.post('/publicacion/vista-previa', todos, (req, res) => {
    const token = publicacion.crearTokenVistaPrevia(req.usuario);
    res.json({ url: publicacion.urlVistaPrevia(token), minutos: 30 });
  });
  r.post('/publicacion/publicar', soloAdmin, asincrono(async (req, res) => res.status(201).json(await publicacion.publicar({ nota: req.body?.nota }, req.usuario))));
  r.get('/publicaciones', soloAdmin, asincrono(async (req, res) => res.json(await publicacion.listar())));
  r.post('/publicaciones/:id/restaurar', soloAdmin, asincrono(async (req, res) => res.status(201).json(await publicacion.restaurar(Number(req.params.id), req.usuario))));

  // ─── Cotizador: servicios, configuración y base de precios ───────────
  const c = express.Router();
  c.use(soloAdmin);
  c.get('/servicios', asincrono(async (req, res) => res.json(await cotizador.listarServicios())));
  c.post('/servicios', asincrono(async (req, res) => res.status(201).json(await cotizador.crearServicio(req.body, req.usuario))));
  c.put('/servicios/orden', asincrono(async (req, res) => res.json(await cotizador.ordenarServicios(req.body?.ids, req.usuario))));
  c.put('/servicios/:id', asincrono(async (req, res) => res.json(await cotizador.actualizarServicio(Number(req.params.id), req.body, req.usuario))));
  c.delete('/servicios/:id', asincrono(async (req, res) => { await cotizador.eliminarServicio(Number(req.params.id), req.usuario); res.status(204).end(); }));

  c.get('/configuracion', asincrono(async (req, res) => res.json(await cotizador.obtenerConfiguracion())));
  c.put('/configuracion', asincrono(async (req, res) => res.json(await cotizador.actualizarConfiguracion(req.body, req.usuario))));

  c.get('/capitulos', asincrono(async (req, res) => res.json(await cotizador.listarCapitulos())));
  c.post('/capitulos', asincrono(async (req, res) => res.status(201).json(await cotizador.crearCapitulo(req.body, req.usuario))));
  c.put('/capitulos/:id', asincrono(async (req, res) => res.json(await cotizador.actualizarCapitulo(Number(req.params.id), req.body, req.usuario))));
  c.delete('/capitulos/:id', asincrono(async (req, res) => { await cotizador.eliminarCapitulo(Number(req.params.id), req.usuario); res.status(204).end(); }));

  c.get('/actividades', asincrono(async (req, res) => res.json(await cotizador.listarActividades({
    buscar: req.query.buscar, capituloId: req.query.capituloId ? Number(req.query.capituloId) : undefined,
    pagina: Number(req.query.pagina) || 1, porPagina: Math.min(Number(req.query.porPagina) || 25, 100),
  }))));
  c.post('/actividades', asincrono(async (req, res) => res.status(201).json(await cotizador.crearActividad(req.body, req.usuario))));
  c.get('/actividades/:id', asincrono(async (req, res) => res.json(await cotizador.obtenerActividad(Number(req.params.id)))));
  c.put('/actividades/:id', asincrono(async (req, res) => res.json(await cotizador.actualizarActividad(Number(req.params.id), req.body, req.usuario))));
  c.put('/actividades/:id/componentes', asincrono(async (req, res) => res.json(await cotizador.guardarComponentes(Number(req.params.id), req.body?.componentes, req.usuario))));
  c.delete('/actividades/:id', asincrono(async (req, res) => { await cotizador.eliminarActividad(Number(req.params.id), req.usuario); res.status(204).end(); }));

  c.get('/insumos', asincrono(async (req, res) => res.json(await cotizador.listarInsumos({
    buscar: req.query.buscar, tipo: req.query.tipo || undefined,
    pagina: Number(req.query.pagina) || 1, porPagina: Math.min(Number(req.query.porPagina) || 25, 100),
  }))));
  c.post('/insumos', asincrono(async (req, res) => res.status(201).json(await cotizador.crearInsumo(req.body, req.usuario))));
  c.put('/insumos/:id', asincrono(async (req, res) => res.json(await cotizador.actualizarInsumo(Number(req.params.id), req.body, req.usuario))));
  c.delete('/insumos/:id', asincrono(async (req, res) => { await cotizador.eliminarInsumo(Number(req.params.id), req.usuario); res.status(204).end(); }));
  r.use('/cotizador', c);

  // ─── Solicitudes y cotizaciones (datos personales, Ley 1581) ─────────
  r.get('/solicitudes', soloAdmin, asincrono(async (req, res) => res.json(await solicitudes.listar({
    estado: req.query.estado || undefined, buscar: req.query.buscar, pagina: Number(req.query.pagina) || 1,
  }))));
  r.get('/solicitudes/:id', soloAdmin, asincrono(async (req, res) => res.json(await solicitudes.obtener(Number(req.params.id)))));
  r.patch('/solicitudes/:id', soloAdmin, asincrono(async (req, res) => res.json(await solicitudes.actualizar(Number(req.params.id), req.body, req.usuario))));
  r.delete('/solicitudes/:id', soloAdmin, asincrono(async (req, res) => { await solicitudes.eliminar(Number(req.params.id), req.usuario); res.status(204).end(); }));

  r.get('/cotizaciones', soloAdmin, asincrono(async (req, res) => res.json(await solicitudes.listarCotizaciones({ buscar: req.query.buscar, pagina: Number(req.query.pagina) || 1 }))));
  r.get('/cotizaciones/:id', soloAdmin, asincrono(async (req, res) => res.json(await solicitudes.obtenerCotizacion(Number(req.params.id)))));
  r.get('/cotizaciones/:id/documento', soloAdmin, asincrono(async (req, res) => {
    const { nombre, contenido: archivo } = await solicitudes.documentoCotizacion(Number(req.params.id));
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.attachment(nombre);
    res.send(archivo);
  }));
  r.post('/cotizaciones/:id/reenviar', soloAdmin, asincrono(async (req, res) => res.json(await solicitudes.reenviarCotizacion(Number(req.params.id), req.usuario))));

  // ─── Usuarios ──────────────────────────────────────────────────────────
  r.get('/usuarios', soloAdmin, asincrono(async (req, res) => res.json(await usuarios.listar())));
  r.post('/usuarios', soloAdmin, asincrono(async (req, res) => res.status(201).json(await usuarios.crear(req.body, req.usuario))));
  r.patch('/usuarios/:id', soloAdmin, asincrono(async (req, res) => res.json(await usuarios.actualizar(Number(req.params.id), req.body, req.usuario))));
  r.post('/usuarios/:id/desbloquear', soloAdmin, asincrono(async (req, res) => res.json(await usuarios.desbloquear(Number(req.params.id), req.usuario))));
  r.post('/usuarios/:id/invitacion', soloAdmin, asincrono(async (req, res) => res.json(await usuarios.reenviarInvitacion(Number(req.params.id), req.usuario))));
  r.delete('/usuarios/:id', soloAdmin, asincrono(async (req, res) => { await usuarios.eliminar(Number(req.params.id), req.usuario); res.status(204).end(); }));

  // ─── Historial y respaldos ───────────────────────────────────────────
  r.get('/historial', soloAdmin, asincrono(async (req, res) => res.json(await historial.listar({
    entidad: req.query.entidad || undefined, usuarioId: req.query.usuarioId ? Number(req.query.usuarioId) : undefined, pagina: Number(req.query.pagina) || 1,
  }))));
  r.get('/historial/:id', soloAdmin, asincrono(async (req, res) => res.json(await historial.obtener(Number(req.params.id)))));

  r.get('/respaldo', soloAdmin, asincrono(async (req, res) => {
    const datos = await respaldo.exportar({ incluirPrecios: req.query.precios === '1', incluirSolicitudes: req.query.solicitudes === '1' }, req.usuario);
    const fecha = new Date().toISOString().slice(0, 10);
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.attachment(`zenite-respaldo-${fecha}.json`);
    res.send(Buffer.from(JSON.stringify(datos, null, 1)));
  }));

  return r;
}
