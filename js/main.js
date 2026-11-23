/**
 * Punto de entrada de Zenite Web.
 * Cada módulo se inicia de forma independiente: si uno falla, los demás
 * siguen funcionando y el error queda registrado en la consola.
 */
import { iniciarNavegacion, reubicarSeccionInicial } from './modules/navegacion.js';
import { iniciarContadores } from './modules/contadores.js';
import { iniciarPortafolio } from './modules/portafolio.js';
import { iniciarCotizador } from './modules/cotizador.js';
import { aplicarContenido, avisoVistaPrevia, obtenerContenido } from './modules/contenido.js';
import { iniciarFormulario } from './modules/formulario.js';
import { iniciarAnimaciones } from './modules/animaciones.js';
import { iniciarVideos } from './modules/videos.js';

async function iniciar() {
  // El menú funciona de inmediato, sin esperar el contenido.
  try { iniciarNavegacion(); } catch (error) { console.error('Zenite Web: el menú no pudo iniciarse.', error); }
  // Contenido del panel (o su copia de respaldo) antes de iniciar los módulos.
  let proyectos;
  if (document.getElementById('inicio')) {
    const { datos, vistaPrevia } = await obtenerContenido();
    aplicarContenido(datos);
    proyectos = datos?.proyectos;
    if (vistaPrevia) avisoVistaPrevia();
  }
  await iniciarModulos({ ...MODULOS, portafolio: () => iniciarPortafolio(proyectos) });
}

const MODULOS = {
  contadores: iniciarContadores,
  portafolio: iniciarPortafolio,
  cotizador: iniciarCotizador,
  formulario: iniciarFormulario,
  videos: iniciarVideos,
  animaciones: iniciarAnimaciones,
};

async function iniciarModulos(modulos) {
  const nombres = Object.keys(modulos);
  const resultados = await Promise.allSettled(Object.values(modulos).map(async (fn) => fn()));
  resultados.forEach((resultado, i) => {
    if (resultado.status === 'rejected') {
      console.error(`Zenite Web: el módulo "${nombres[i]}" no pudo iniciarse.`, resultado.reason);
    }
  });

  // Con el contenido dinámico ya cargado, se corrige el salto a #seccion.
  reubicarSeccionInicial();
  if (document.readyState === 'complete') return;
  window.addEventListener('load', reubicarSeccionInicial, { once: true });
}

iniciar();
