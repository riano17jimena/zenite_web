/**
 * Punto de entrada: `npm start` (producción en Render) o `npm run demo`.
 * @module servidor
 */
import { crearApp, crearServicios, RUTAS } from './app.js';
import { cargarConfiguracion } from './config.js';
import { crearDb } from './db.js';
import { cifrarContrasena } from './seguridad/criptografia.js';
import { sembrarContenido, sembrarCotizador } from './servicios/semilla.js';

const DOCE_HORAS = 12 * 3600_000;

async function prepararDemo(servicios) {
  const { db } = servicios;
  console.log('Modo demostración: cargando el contenido actual del sitio y la base de precios en memoria…');
  await sembrarContenido({ db, medios: servicios.medios, almacenamiento: servicios.almacenamiento, rutaDatos: RUTAS.datosIniciales, raiz: RUTAS.raizServidor });
  const precios = await sembrarCotizador({ db, rutaDatos: RUTAS.datosIniciales, carpetaPrivada: RUTAS.datosPrivados });
  await servicios.cotizador.recalcularActividades(null);
  const sistema = { id: null, nombre: 'Carga inicial' };
  await servicios.publicacion.publicar({ nota: 'Contenido migrado del sitio anterior' }, sistema);
  const contrasena = 'ZeniteDemo2026';
  const hash = await cifrarContrasena(contrasena);
  await db.usuario.create({ data: { nombre: 'Administrador de prueba', correo: 'admin@zenite.demo', rol: 'ADMINISTRADOR', hashContrasena: hash } });
  await db.usuario.create({ data: { nombre: 'Editora de prueba', correo: 'editor@zenite.demo', rol: 'EDITOR', hashContrasena: hash } });
  console.log(`Precios: ${precios.actividades} actividades, ${precios.insumos} insumos.`);
  console.log(`Usuarios de prueba: admin@zenite.demo y editor@zenite.demo · contraseña ${contrasena}`);
  console.log('El código de acceso se ve en el panel (enlace «Bandeja de correo de prueba») o en /api/demo/correos.');
}

async function iniciar() {
  const config = cargarConfiguracion();
  const db = await crearDb(config);
  const servicios = crearServicios({ db, config });
  if (config.demo) await prepararDemo(servicios);

  const app = crearApp({ config, servicios });
  const servidor = app.listen(config.puerto, () => {
    console.log(`Zenite Web API escuchando en ${config.urlApi} (panel en /panel)`);
  });

  const mantener = () => servicios.mantenimiento.ejecutar()
    .then((r) => { if (r.anonimizadas) console.log(`Ley 1581: ${r.anonimizadas} solicitudes vencidas anonimizadas.`); })
    .catch((e) => console.error('Error en el mantenimiento programado', e));
  setTimeout(mantener, 30_000).unref();
  setInterval(mantener, DOCE_HORAS).unref();

  const cerrar = async () => {
    servidor.close();
    await db.$disconnect?.();
    process.exit(0);
  };
  process.on('SIGTERM', cerrar);
  process.on('SIGINT', cerrar);
}

iniciar().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error.message);
  process.exit(1);
});
