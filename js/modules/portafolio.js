/**
 * Portafolio de proyectos (RF-05).
 * - Los proyectos vienen del panel de administración (API) o de la copia de
 *   respaldo data/contenido.json; el orden es el que se definió en el panel.
 * - Se muestran en una franja que se mueve sola (marquesina.js).
 * - Cada tarjeta muestra su descripción completa y, si tiene varias imágenes,
 *   flechas para pasarlas ahí mismo, sin abrir otra ventana.
 * @module portafolio
 */
import { crear } from './utilidades.js';
import { crearMarquesina } from './marquesina.js';
import { nombreCategoria } from './categorias.js';

const RAIZ_SITIO = new URL('../../', import.meta.url);

/** @param {object[]|undefined} proyectos  Proyectos publicados, en orden. */
export async function iniciarPortafolio(proyectos) {
  const lista = document.getElementById('portafolio-lista');
  if (!lista) return;

  if (!proyectos?.length) {
    lista.replaceChildren(crear('li', {}, [
      crear('p', { clase: 'mensaje-error', texto: 'No pudimos cargar el portafolio. Puedes verlo en nuestro Instagram.' }),
    ]));
    lista.removeAttribute('aria-busy');
    return;
  }

  lista.replaceChildren(...proyectos.map(tarjeta));
  lista.removeAttribute('aria-busy');

  const contenedor = document.getElementById('portafolio-marquesina');
  crearMarquesina(contenedor, { botonPausa: document.getElementById('portafolio-pausa') });
  document.dispatchEvent(new CustomEvent('zenite:contenido-cargado'));

  // Delegación en la franja completa: también responde la copia visual de la marquesina.
  contenedor.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-galeria]');
    if (boton) moverGaleria(boton.closest('.proyecto'), boton.dataset.galeria === 'siguiente' ? 1 : -1);
  });
}

function datosVisibles(proyecto) {
  return [
    proyecto.ubicacion,
    proyecto.area ? `${proyecto.area.toLocaleString('es-CO')} m²` : null,
    proyecto.anio,
  ].filter(Boolean).join(' · ');
}

function rutaImagen(src) {
  return new URL(src, RAIZ_SITIO).href;
}

function tarjeta(proyecto) {
  const idTitulo = `proyecto-${proyecto.id}`;
  const datos = datosVisibles(proyecto);
  const total = proyecto.imagenes.length;

  const imagenes = proyecto.imagenes.map((img, i) => crear('img', {
    src: rutaImagen(img.url960 ?? img.url),
    alt: img.alt,
    loading: i === 0 ? 'lazy' : 'eager',
    decoding: 'async',
    clase: i === 0 ? 'esta-activa' : null,
    'aria-hidden': i === 0 ? null : 'true',
  }));

  const controles = total > 1 ? [
    crear('button', { type: 'button', clase: 'galeria__flecha galeria__flecha--anterior', 'data-galeria': 'anterior', 'aria-label': `Imagen anterior de ${proyecto.titulo}` }, [
      crear('span', { 'aria-hidden': 'true', texto: '←' }),
    ]),
    crear('button', { type: 'button', clase: 'galeria__flecha galeria__flecha--siguiente', 'data-galeria': 'siguiente', 'aria-label': `Imagen siguiente de ${proyecto.titulo}` }, [
      crear('span', { 'aria-hidden': 'true', texto: '→' }),
    ]),
    crear('p', { clase: 'galeria__contador', 'aria-live': 'polite', 'data-contador-galeria': '' }, [
      crear('span', { clase: 'visually-hidden', texto: 'Imagen ' }),
      crear('span', { 'data-actual': '', texto: '1' }),
      crear('span', { 'aria-hidden': 'true', texto: ' / ' }),
      crear('span', { clase: 'visually-hidden', texto: ' de ' }),
      String(total),
    ]),
  ] : [];

  return crear('li', { 'data-tipo': proyecto.categoria }, [
    crear('article', { clase: 'proyecto', 'aria-labelledby': idTitulo, 'data-indice': '0' }, [
      crear('figure', { clase: 'proyecto__imagen galeria' }, [...imagenes, ...controles]),
      crear('div', { clase: 'proyecto__cuerpo' }, [
        crear('p', { clase: 'proyecto__tipo', texto: nombreCategoria(proyecto.categoria) }),
        crear('h3', { clase: 'proyecto__titulo', id: idTitulo, texto: proyecto.titulo }),
        datos ? crear('p', { clase: 'proyecto__datos', texto: datos }) : null,
        crear('p', { clase: 'proyecto__descripcion', texto: proyecto.descripcion }),
      ]),
    ]),
  ]);
}

/** Muestra la imagen anterior o siguiente de una tarjeta (en ciclo). */
function moverGaleria(tarjetaProyecto, paso) {
  if (!tarjetaProyecto) return;
  const imagenes = [...tarjetaProyecto.querySelectorAll('.galeria img')];
  const actual = Number(tarjetaProyecto.dataset.indice) || 0;
  const siguiente = (actual + paso + imagenes.length) % imagenes.length;

  imagenes.forEach((img, i) => {
    const activa = i === siguiente;
    img.classList.toggle('esta-activa', activa);
    if (activa) img.removeAttribute('aria-hidden'); else img.setAttribute('aria-hidden', 'true');
  });
  tarjetaProyecto.dataset.indice = String(siguiente);
  const contador = tarjetaProyecto.querySelector('[data-actual]');
  if (contador) contador.textContent = String(siguiente + 1);
}
