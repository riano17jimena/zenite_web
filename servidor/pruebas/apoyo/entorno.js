/**
 * Entorno de pruebas: API completa sobre la base en memoria, correo simulado,
 * archivos en una carpeta temporal y precios de ejemplo (no los del Excel).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearApp, crearServicios, RUTAS } from '../../src/app.js';
import { cargarConfiguracion } from '../../src/config.js';
import { crearPrismaMemoria } from '../../src/demo/prisma-memoria.js';
import { cifrarContrasena } from '../../src/seguridad/criptografia.js';
import { sembrarContenido, sembrarCotizador } from '../../src/servicios/semilla.js';

export const CONTRASENA = 'PruebaSegura2026';
const PRECIOS_EJEMPLO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'datos', 'precios-ejemplo');

export async function crearEntorno() {
  const carpeta = await mkdtemp(path.join(os.tmpdir(), 'zenite-pruebas-'));
  const config = cargarConfiguracion({ NODE_ENV: 'test', ZENITE_DEMO: '0', CARPETA_MEDIOS: carpeta, URL_API: 'http://127.0.0.1:0', URL_SITIO: 'http://sitio.prueba', ORIGENES_PERMITIDOS: 'http://sitio.prueba' });
  const db = crearPrismaMemoria();
  const servicios = crearServicios({ db, config });
  await sembrarContenido({ db, medios: servicios.medios, almacenamiento: servicios.almacenamiento, rutaDatos: RUTAS.datosIniciales, raiz: RUTAS.raizServidor });
  await sembrarCotizador({ db, rutaDatos: RUTAS.datosIniciales, carpetaPrivada: PRECIOS_EJEMPLO });
  await servicios.cotizador.recalcularActividades(null);
  await servicios.publicacion.publicar({ nota: 'Inicial' }, null);
  const hash = await cifrarContrasena(CONTRASENA);
  await db.usuario.create({ data: { nombre: 'Admin Prueba', correo: 'admin@prueba.co', rol: 'ADMINISTRADOR', hashContrasena: hash } });
  await db.usuario.create({ data: { nombre: 'Editor Prueba', correo: 'editor@prueba.co', rol: 'EDITOR', hashContrasena: hash } });

  const app = crearApp({ config, servicios, registro: { error() {} } });
  const servidor = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const url = `http://127.0.0.1:${servidor.address().port}`;
  config.urlApi = url; // para la verificación de Origin (CSRF)

  /** Cliente HTTP con cookie de sesión, como el navegador del panel. */
  function cliente({ panel = true } = {}) {
    let cookie = '';
    async function pedir(metodo, ruta, cuerpo, cabeceras = {}) {
      const h = { ...cabeceras };
      if (panel) h['X-Zenite-Panel'] = '1';
      if (cookie) h.Cookie = cookie;
      let body;
      if (Buffer.isBuffer(cuerpo)) body = cuerpo;
      else if (cuerpo !== undefined) { body = JSON.stringify(cuerpo); h['Content-Type'] = 'application/json'; }
      const r = await fetch(url + ruta, { method: metodo, headers: h, body, redirect: 'manual' });
      const set = r.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const tipo = r.headers.get('content-type') ?? '';
      const datos = tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
      return { estado: r.status, datos, cabeceras: r.headers };
    }
    return {
      get: (ruta, h) => pedir('GET', ruta, undefined, h),
      post: (ruta, c, h) => pedir('POST', ruta, c, h),
      put: (ruta, c) => pedir('PUT', ruta, c),
      patch: (ruta, c) => pedir('PATCH', ruta, c),
      delete: (ruta) => pedir('DELETE', ruta),
      get cookie() { return cookie; },
    };
  }

  /** Último código de acceso enviado a un correo (bandeja simulada). */
  function ultimoCodigo(correo) {
    const m = servicios.correo.bandeja.find((x) => x.to === correo && /código/i.test(x.subject));
    return m?.text.match(/\b(\d{6})\b/)?.[1];
  }

  async function ingresar(correo) {
    const c = cliente();
    const paso1 = await c.post('/api/auth/ingresar', { correo, contrasena: CONTRASENA });
    if (paso1.estado !== 200) throw new Error(`No ingresó: ${JSON.stringify(paso1.datos)}`);
    const paso2 = await c.post('/api/auth/verificar', { desafio: paso1.datos.desafio, codigo: ultimoCodigo(correo) });
    if (paso2.estado !== 200) throw new Error(`Código rechazado: ${JSON.stringify(paso2.datos)}`);
    return c;
  }

  return {
    url, config, db, servicios, cliente, ultimoCodigo, ingresar,
    async cerrar() {
      await new Promise((ok) => servidor.close(ok));
      await rm(carpeta, { recursive: true, force: true });
    },
  };
}
