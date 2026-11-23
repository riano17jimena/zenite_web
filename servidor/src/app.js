/**
 * Arma los servicios y la aplicación Express. Se separa de servidor.js para
 * poder probar la API completa con una base de datos en memoria.
 * @module app
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cabecerasSeguridad, cargarSesion, corsPublico, manejarErrores, protegerCsrf,
} from './middleware/index.js';
import { rutasAdmin } from './rutas/admin.js';
import { rutasAuth } from './rutas/auth.js';
import { rutasPublicas } from './rutas/publicas.js';
import { crearServicioAcceso } from './servicios/acceso.js';
import { crearAlmacenamiento } from './servicios/almacenamiento.js';
import { crearServicioContenido } from './servicios/contenido.js';
import { crearServicioCorreo } from './servicios/correo.js';
import { crearServicioCotizador } from './servicios/cotizador.js';
import { crearServicioHistorial } from './servicios/historial.js';
import { crearServicioMedios } from './servicios/medios.js';
import { crearServicioPublicacion } from './servicios/publicacion.js';
import { crearServicioRespaldo, crearTareasMantenimiento } from './servicios/respaldo.js';
import { crearServicioSolicitudes } from './servicios/solicitudes.js';
import { crearServicioUsuarios } from './servicios/usuarios.js';

const RAIZ_SERVIDOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RUTAS = {
  raizServidor: RAIZ_SERVIDOR,
  raizSitio: path.resolve(RAIZ_SERVIDOR, '..'),
  panel: path.join(RAIZ_SERVIDOR, 'panel'),
  datosIniciales: path.join(RAIZ_SERVIDOR, 'prisma', 'datos', 'contenido-inicial.json'),
  datosPrivados: path.join(RAIZ_SERVIDOR, 'prisma', 'datos-privados'),
};

/** Crea todos los servicios de dominio sobre una base de datos. */
export function crearServicios({ db, config, correo, almacenamiento, transporteCorreo }) {
  const correoS = correo ?? crearServicioCorreo({ config, transporte: transporteCorreo });
  const almacenamientoS = almacenamiento ?? crearAlmacenamiento(config);
  const historial = crearServicioHistorial({ db });
  const acceso = crearServicioAcceso({ db, config, correo: correoS, historial });
  const contenido = crearServicioContenido({ db, historial });
  const cotizador = crearServicioCotizador({ db, historial });
  const solicitudes = crearServicioSolicitudes({ db, config, correo: correoS, cotizador, historial });
  return {
    db,
    correo: correoS,
    almacenamiento: almacenamientoS,
    historial,
    acceso,
    contenido,
    cotizador,
    solicitudes,
    medios: crearServicioMedios({ db, config, almacenamiento: almacenamientoS, historial }),
    publicacion: crearServicioPublicacion({ db, config, contenido, historial }),
    usuarios: crearServicioUsuarios({ db, config, correo: correoS, historial, acceso }),
    respaldo: crearServicioRespaldo({ db, historial }),
    mantenimiento: crearTareasMantenimiento({ db, solicitudes }),
  };
}

/** Bloquea rutas internas cuando el modo demostración sirve el sitio completo. */
const RUTAS_OCULTAS = /^\/(servidor|node_modules|\.git|\.github|pruebas|tests|docs\/privado)(\/|$)/i;

export function crearApp({ config, servicios, registro = console }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.produccion) app.set('trust proxy', 1); // Render está detrás de un proxy

  app.use(cabecerasSeguridad(config));

  app.get('/api/salud', (req, res) => res.json({ estado: 'ok', hora: new Date().toISOString() }));

  const json = express.json({ limit: '200kb' });
  app.use('/api/publico', corsPublico(config), json, rutasPublicas({ servicios }));

  app.use('/api/auth', protegerCsrf(config), json, cargarSesion(servicios.acceso), rutasAuth({ servicios, config }));
  // La subida de archivos llega como binario: no pasa por el lector de JSON.
  const jsonSalvoArchivos = (req, res, next) => (req.method === 'POST' && req.path === '/medios' ? next() : json(req, res, next));
  app.use('/api/admin', protegerCsrf(config), jsonSalvoArchivos, cargarSesion(servicios.acceso), rutasAdmin({ servicios, config }));

  if (config.demo) {
    // Bandeja de correo simulada: muestra los códigos de acceso y las cotizaciones "enviadas".
    app.get('/api/demo/correos', (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(servicios.correo.bandeja.map((m) => ({ para: m.to, asunto: m.subject, texto: m.text, adjuntos: m.attachments, fecha: m.fecha })));
    });
  }
  app.use('/api', (req, res) => res.status(404).json({ error: 'Esa dirección de la API no existe.' }));

  app.use('/panel', express.static(RUTAS.panel, { extensions: ['html'], maxAge: config.produccion ? 3600_000 : 0 }));

  if (servicios.almacenamiento.nombre === 'local') {
    app.use('/medios', express.static(servicios.almacenamiento.carpeta, { maxAge: 86_400_000 }));
  }

  if (config.demo || config.servirSitio) {
    app.use((req, res, next) => (RUTAS_OCULTAS.test(req.path) ? res.status(404).end() : next()));
    app.use(express.static(RUTAS.raizSitio));
  } else {
    app.get('/', (req, res) => res.redirect('/panel/'));
  }

  app.use(manejarErrores(config, registro));
  return app;
}
