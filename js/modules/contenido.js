/**
 * Contenido administrable del sitio.
 * Lee la versión publicada desde la API (lo que el arquitecto edita en el
 * panel). Si la API no responde, usa data/contenido.json, una copia del
 * contenido; y si tampoco carga, queda el HTML original de la página.
 * Con ?vista-previa=… muestra el borrador (solo con un enlace del panel).
 * @module contenido
 */
import { llamarApi } from './api.js';
import { cargarJSON, crear } from './utilidades.js';

const RESPALDO = new URL('../../data/contenido.json', import.meta.url);
const NUEVA = ' (se abre en una pestaña nueva)';

/** @returns {Promise<{datos: object|null, origen: 'api'|'respaldo'|'html', vistaPrevia: boolean}>} */
export async function obtenerContenido() {
  const token = new URLSearchParams(location.search).get('vista-previa');
  try {
    const ruta = `/api/publico/contenido${token ? `?vista-previa=${encodeURIComponent(token)}` : ''}`;
    const datos = await llamarApi(ruta, { tiempo: token ? 30000 : 4000 });
    return { datos, origen: 'api', vistaPrevia: Boolean(datos.vistaPrevia) };
  } catch (error) {
    if (token) avisoVistaPrevia(error.message, true);
    try {
      return { datos: await cargarJSON(RESPALDO), origen: 'respaldo', vistaPrevia: false };
    } catch {
      return { datos: null, origen: 'html', vistaPrevia: false };
    }
  }
}

/** Aplica el contenido a la página de inicio. Cada sección es independiente. */
export function aplicarContenido(datos) {
  if (!datos) return;
  const pasos = { hero, videos, testimonios, preguntas, contactos, perfil };
  for (const [nombre, fn] of Object.entries(pasos)) {
    try { fn(datos); } catch (error) { console.error(`Zenite Web: no se pudo aplicar «${nombre}».`, error); }
  }
}

export function avisoVistaPrevia(texto, error = false) {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow';
  document.head.append(meta);
  const aviso = crear('div', { clase: `aviso-vista-previa${error ? ' aviso-vista-previa--error' : ''}`, role: 'status' }, [
    crear('strong', { texto: error ? 'No se pudo abrir la vista previa. ' : 'Vista previa del borrador. ' }),
    error ? texto : 'Así se verá el sitio cuando publiques los cambios. Los visitantes todavía ven la versión publicada.',
  ]);
  document.body.prepend(aviso);
}

// ─── Secciones ─────────────────────────────────────────────────────────

function hero({ hero: h }) {
  if (!h) return;
  const seccion = document.getElementById('inicio');
  const ante = seccion.querySelector('.antetitulo');
  const numero = ante.querySelector('.antetitulo__num');
  ante.replaceChildren(...(numero ? [numero, ' '] : []), h.antetitulo);
  seccion.querySelector('#hero-titulo').textContent = h.titulo;
  seccion.querySelector('.hero__texto').textContent = h.texto;
  const pie = seccion.querySelector('.hero__pie span');
  if (pie) { pie.textContent = h.pieImagen ?? ''; pie.hidden = !h.pieImagen; }
  const img = seccion.querySelector('.hero__fondo');
  if (h.imagen?.url && img.getAttribute('src') !== h.imagen.url) {
    img.src = h.imagen.url;
    img.srcset = h.imagen.url960 ? `${h.imagen.url960} 960w, ${h.imagen.url} ${h.imagen.ancho ?? 1920}w` : '';
    img.alt = h.imagen.alt;
    if (h.imagen.ancho) { img.width = h.imagen.ancho; img.height = h.imagen.alto; }
  }
}

const duracionTexto = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const duracionLarga = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} segundos`);

function videos({ videos: lista }) {
  const contenedor = document.querySelector('#videos-carrusel .swiper-wrapper');
  if (!contenedor || !lista?.length) return;
  contenedor.replaceChildren(...lista.map((v, i) => {
    const idTexto = `video-${i + 1}-texto`;
    const video = crear('video', { clase: 'video__medio', preload: 'none', playsinline: true, poster: v.poster, 'aria-describedby': idTexto, width: v.ancho ?? 720, height: v.alto ?? 1245 }, [
      crear('source', { src: v.url, type: 'video/mp4' }),
    ]);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M8 5.5v13l10.5-6.5z'); path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return crear('li', { clase: 'swiper-slide' }, [
      crear('figure', { clase: 'video', 'data-video': '' }, [
        crear('div', { clase: 'video__marco' }, [
          video,
          crear('button', { type: 'button', clase: 'video__reproducir', 'aria-label': `Reproducir video: ${v.titulo}${v.duracionSeg ? ` (${duracionLarga(v.duracionSeg)})` : ''}` }, [svg]),
          v.duracionSeg ? crear('span', { clase: 'video__duracion', 'aria-hidden': 'true', texto: duracionTexto(v.duracionSeg) }) : null,
        ]),
        crear('figcaption', { clase: 'video__texto' }, [
          crear('span', { clase: 'video__etiqueta', texto: v.etiqueta }),
          crear('h3', { clase: 'video__titulo', texto: v.titulo }),
          crear('p', { id: idTexto, texto: v.descripcion }),
          v.transcripcion ? crear('details', { clase: 'video__transcripcion' }, [crear('summary', { texto: 'Leer la transcripción' }), crear('p', { texto: v.transcripcion })]) : null,
        ]),
      ]),
    ]);
  }));
}

const esEjemplo = (t) => /ejemplo/i.test(`${t.nombre} ${t.proyecto}`);

function testimonios({ testimonios: lista }) {
  const seccion = document.getElementById('testimonios');
  if (!seccion || !lista) return;
  seccion.hidden = lista.length === 0;
  const aviso = seccion.querySelector('.aviso-provisional');
  if (aviso) aviso.hidden = !lista.some(esEjemplo);
  seccion.querySelector('.testimonios').replaceChildren(...lista.map((t) => crear('li', { 'data-revelar': '' }, [
    crear('figure', { clase: 'testimonio' }, [
      esEjemplo(t) ? crear('span', { clase: 'etiqueta-provisional', texto: 'Ejemplo provisional' }) : null,
      t.foto ? crear('img', { clase: 'testimonio__foto', src: t.foto.url960 ?? t.foto.url, alt: t.foto.alt, width: 64, height: 64, loading: 'lazy' }) : null,
      crear('blockquote', {}, [crear('p', { texto: t.comentario })]),
      crear('figcaption', {}, [crear('strong', { texto: t.nombre }), crear('span', { texto: [t.proyecto.replace(/\s*·\s*ejemplo provisional/i, ''), t.ciudad].filter(Boolean).join(' · ') })]),
    ]),
  ])));
}

function preguntas({ preguntas: lista }) {
  const acordeon = document.getElementById('acordeon-preguntas');
  if (!acordeon || !lista?.length) return;
  acordeon.replaceChildren(...lista.map((q, i) => {
    const id = `faq-${i + 1}`;
    return crear('div', { clase: 'accordion-item' }, [
      crear('h3', { clase: 'accordion-header' }, [
        crear('button', { clase: 'accordion-button collapsed', type: 'button', 'data-bs-toggle': 'collapse', 'data-bs-target': `#${id}`, 'aria-expanded': 'false', 'aria-controls': id, texto: q.pregunta }),
      ]),
      crear('div', { id, clase: 'accordion-collapse collapse', 'data-bs-parent': '#acordeon-preguntas' }, [crear('div', { clase: 'accordion-body', texto: q.respuesta })]),
    ]);
  }));
}

function enlaceContacto(c) {
  if (!c.enlace) return c.valor;
  const externo = /^https:/i.test(c.enlace);
  return crear('a', { href: c.enlace, ...(externo ? { rel: 'noopener', target: '_blank' } : {}) }, [
    c.valor, externo ? crear('span', { clase: 'visually-hidden', texto: NUEVA }) : null,
  ]);
}

function contactos({ contactos: lista }) {
  if (!lista?.length) return;
  const dl = document.querySelector('#contacto .datos-contacto dl');
  if (dl) dl.replaceChildren(...lista.map((c) => crear('div', {}, [crear('dt', { texto: c.etiqueta }), crear('dd', {}, [enlaceContacto(c)])])));
  const whatsapp = lista.find((c) => c.tipo === 'WHATSAPP' && c.enlace);
  if (whatsapp) {
    for (const a of document.querySelectorAll('a[href^="https://wa.me/"]')) {
      const actual = new URL(a.href);
      const nueva = new URL(whatsapp.enlace);
      nueva.search = actual.search;
      a.href = nueva.href;
    }
  }
}

function perfil({ perfiles }) {
  const p = perfiles?.[0];
  const seccion = document.getElementById('nosotros');
  if (!p || !seccion) return;
  const img = seccion.querySelector('.retrato img');
  if (p.foto && img && img.getAttribute('src') !== p.foto.url) {
    img.src = p.foto.url;
    img.alt = p.foto.alt;
    if (p.foto.ancho) { img.width = p.foto.ancho; img.height = p.foto.alto; }
  }
  const pie = seccion.querySelector('.retrato figcaption');
  if (pie) pie.textContent = `Arq. ${p.nombre} · ${p.cargo}`;
  if (p.lema) seccion.querySelector('#nosotros-titulo').textContent = p.lema;
  const mision = seccion.querySelector('.texto-guia');
  if (mision) mision.hidden = !p.mision;
  if (mision && p.mision) {
    const [primera, ...resto] = p.mision.split(/(?<=^Nuestra misión)\s/);
    mision.replaceChildren(...(resto.length ? [crear('strong', { texto: primera }), ` ${resto.join(' ')}`] : [p.mision]));
  }
  const nombre = seccion.querySelector('.subtitulo-seccion');
  if (nombre) nombre.textContent = p.nombre;
  const dl = seccion.querySelector('.perfil');
  if (dl) {
    dl.replaceChildren(...[['Formación', p.formacion], ['Trayectoria', p.trayectoria], ['Experiencia', p.experiencia]]
      .filter(([, v]) => v).map(([t, v]) => crear('div', {}, [crear('dt', { texto: t }), crear('dd', { texto: v })])));
  }
}
