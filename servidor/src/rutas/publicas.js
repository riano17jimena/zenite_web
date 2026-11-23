/**
 * API pública que consume el sitio en Netlify. No requiere sesión.
 * Nunca expone la base de precios completa: el buscador devuelve solo
 * descripción y unidad, y los valores aparecen únicamente en el resultado
 * calculado de la cotización.
 * @module rutas/publicas
 */
import express from 'express';
import { crearLimitador, limitarPorIp } from '../seguridad/limites.js';
import { asincrono } from '../middleware/index.js';
import { esquemaSeleccion } from '../servicios/solicitudes.js';

const MINUTO = 60_000;

export function rutasPublicas({ servicios }) {
  const { publicacion, cotizador, solicitudes } = servicios;
  const r = express.Router();
  const limiteLectura = limitarPorIp(crearLimitador({ maximo: 240, ventanaMs: 10 * MINUTO }));
  const limiteBusqueda = limitarPorIp(crearLimitador({ maximo: 120, ventanaMs: 10 * MINUTO }));
  const limiteCalculo = limitarPorIp(crearLimitador({ maximo: 60, ventanaMs: 10 * MINUTO }));
  const limiteEnvio = limitarPorIp(crearLimitador({ maximo: 5, ventanaMs: 60 * MINUTO }), 'Ya recibimos varias solicitudes desde tu conexión. Espera un momento o escríbenos por WhatsApp.');

  /** Campo trampa: las personas no lo ven; los robots lo llenan. */
  const esRobot = (body) => Boolean(body?.sitioWeb);

  r.get('/contenido', limiteLectura, asincrono(async (req, res) => {
    const token = req.query['vista-previa'];
    if (token) {
      if (!publicacion.tokenVistaPreviaValido(token)) {
        return res.status(401).json({ error: 'El enlace de vista previa venció. Genera uno nuevo desde el panel.' });
      }
      res.set('Cache-Control', 'no-store');
      return res.json({ vistaPrevia: true, ...(await publicacion.construirBorrador()) });
    }
    const datos = await publicacion.publicado();
    if (!datos) return res.status(404).json({ error: 'Todavía no hay contenido publicado.' });
    res.set('Cache-Control', 'public, max-age=60');
    return res.json(datos);
  }));

  r.get('/cotizador/opciones', limiteLectura, asincrono(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(await cotizador.opcionesPublicas());
  }));

  r.get('/cotizador/actividades', limiteBusqueda, asincrono(async (req, res) => {
    res.json(await cotizador.buscarActividadesPublicas({ capitulo: req.query.capitulo, buscar: req.query.buscar }));
  }));

  r.post('/cotizador/calcular', limiteCalculo, asincrono(async (req, res) => {
    res.json(await cotizador.calcular(esquemaSeleccion.parse(req.body?.seleccion ?? req.body)));
  }));

  r.post('/cotizaciones', limiteEnvio, asincrono(async (req, res) => {
    if (esRobot(req.body)) return res.status(201).json({ codigo: null, mensaje: 'Recibimos tu solicitud.' });
    const resultado = await solicitudes.crearCotizacion(req.body, { ip: req.ip });
    res.status(201).json({ ...resultado, mensaje: `Recibimos tu solicitud. Tu número de cotización es ${resultado.codigo}; te contactaremos pronto.` });
  }));

  r.post('/contacto', limiteEnvio, asincrono(async (req, res) => {
    if (esRobot(req.body)) return res.status(201).json({ mensaje: 'Recibimos tu mensaje.' });
    await solicitudes.crearDesdeFormulario(req.body, { ip: req.ip });
    res.status(201).json({ mensaje: 'Recibimos tu mensaje. Te responderemos en un plazo máximo de un día hábil.' });
  }));

  return r;
}
