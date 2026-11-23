/**
 * Estructura del panel: sesión, menú según el rol y navegación por secciones
 * (#/portafolio, #/videos…). Al cambiar de sección el foco va al título.
 */
import { enviar, obtener } from './api.js';
import { abrirBandeja, hayDemo } from './demo.js';
import { anunciarError, h, vaciar } from './ui.js';

const RUTAS = [
  { grupo: 'General' },
  { ruta: '', texto: 'Tablero', modulo: 'tablero' },
  { ruta: 'publicar', texto: 'Publicar cambios', modulo: 'publicar' },
  { grupo: 'Contenido del sitio' },
  { ruta: 'inicio', texto: 'Inicio (portada)', modulo: 'inicio' },
  { ruta: 'portafolio', texto: 'Portafolio', modulo: 'secciones', recurso: 'proyectos' },
  { ruta: 'videos', texto: 'Videos', modulo: 'secciones', recurso: 'videos' },
  { ruta: 'testimonios', texto: 'Testimonios', modulo: 'secciones', recurso: 'testimonios' },
  { ruta: 'preguntas', texto: 'Preguntas frecuentes', modulo: 'secciones', recurso: 'preguntas' },
  { ruta: 'contacto', texto: 'Datos de contacto', modulo: 'secciones', recurso: 'contactos' },
  { ruta: 'perfil', texto: 'Perfil del arquitecto', modulo: 'secciones', recurso: 'perfiles' },
  { ruta: 'medios', texto: 'Fotos y videos', modulo: 'medios' },
  { grupo: 'Cotizador', admin: true },
  { ruta: 'cotizador', texto: 'Precios y servicios', modulo: 'cotizador', admin: true },
  { ruta: 'cotizaciones', texto: 'Cotizaciones', modulo: 'cotizaciones', admin: true },
  { grupo: 'Clientes', admin: true },
  { ruta: 'solicitudes', texto: 'Solicitudes', modulo: 'solicitudes', admin: true, insignia: 'nuevas' },
  { grupo: 'Administración', admin: true },
  { ruta: 'usuarios', texto: 'Usuarios', modulo: 'usuarios', admin: true },
  { ruta: 'historial', texto: 'Historial de cambios', modulo: 'historial', admin: true },
  { ruta: 'respaldos', texto: 'Respaldos', modulo: 'respaldos', admin: true },
  { grupo: 'Mi cuenta' },
  { ruta: 'cuenta', texto: 'Cambiar contraseña', modulo: 'cuenta' },
];

const vista = document.getElementById('vista');
const menu = document.getElementById('menu');
const botonMenu = document.getElementById('boton-menu');
let contexto;
let renderActual = 0;

function rutaActual() {
  return location.hash.replace(/^#\/?/, '').split('?')[0];
}

function construirMenu() {
  vaciar(menu);
  const visibles = RUTAS.filter((r) => !r.admin || contexto.esAdmin);
  menu.append(h('a', { class: 'menu-marca', href: '#/' }, h('img', { src: 'img/favicon.svg', alt: '' }), h('span', {}, h('strong', { text: 'Zenite Web' }), h('small', { text: 'Panel de administración' }))));
  let lista = null;
  for (const r of visibles) {
    if (r.grupo) {
      const id = `grupo-${r.grupo.toLowerCase().replace(/\W+/g, '-')}`;
      menu.append(h('p', { class: 'menu-grupo', id, text: r.grupo }));
      lista = h('ul', { 'aria-labelledby': id });
      menu.append(lista);
      continue;
    }
    lista.append(h('li', {}, h('a', { href: `#/${r.ruta}`, dataset: { ruta: r.ruta } }, h('span', { text: r.texto }),
      r.insignia ? h('span', { class: 'insignia', dataset: { insignia: r.insignia }, hidden: true }) : null)));
  }
}

function marcarActual(ruta) {
  for (const a of menu.querySelectorAll('a[data-ruta]')) {
    if (a.dataset.ruta === ruta) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

export async function actualizarInsignias() {
  if (!contexto.esAdmin) return;
  try {
    const r = await obtener('/api/admin/solicitudes?estado=NUEVA');
    const insignia = menu.querySelector('[data-insignia="nuevas"]');
    if (insignia) {
      insignia.hidden = !r.total;
      insignia.textContent = r.total;
      insignia.setAttribute('aria-label', `${r.total} nuevas`);
    }
  } catch { /* sin insignia */ }
}

async function mostrar() {
  const ruta = rutaActual();
  const definicion = RUTAS.find((r) => r.modulo && r.ruta === ruta) ?? RUTAS[1];
  if (definicion.admin && !contexto.esAdmin) {
    location.hash = '#/';
    return;
  }
  const turno = ++renderActual;
  marcarActual(definicion.ruta);
  menu.classList.remove('abierto');
  botonMenu.setAttribute('aria-expanded', 'false');
  document.title = `${definicion.texto} · Panel Zenite Web`;
  vaciar(vista).append(h('p', { class: 'texto-suave', role: 'status', text: 'Cargando…' }));
  try {
    const modulo = await import(`./vistas/${definicion.modulo}.js`);
    if (turno !== renderActual) return;
    const contenedor = h('div');
    await modulo.mostrar(contenedor, { ...contexto, recurso: definicion.recurso, titulo: definicion.texto });
    if (turno !== renderActual) return;
    vaciar(vista).append(contenedor);
    const titulo = vista.querySelector('h1');
    if (titulo) { titulo.tabIndex = -1; titulo.focus({ preventScroll: false }); }
  } catch (error) {
    if (turno !== renderActual) return;
    vaciar(vista).append(h('h1', { text: definicion.texto }), h('div', { class: 'mensaje mensaje-error', role: 'alert', text: error.message }));
  }
}

async function iniciar() {
  let usuario;
  let urlSitio = '/';
  try {
    ({ usuario, urlSitio } = await obtener('/api/auth/yo'));
  } catch {
    location.replace(`./?volver=${encodeURIComponent(location.hash)}`);
    return;
  }
  const [opciones, demo] = await Promise.all([fetch('/api/publico/cotizador/opciones').then((r) => r.json()).catch(() => ({ tiposProyecto: [] })), hayDemo()]);
  contexto = { usuario, urlSitio, esAdmin: usuario.rol === 'ADMINISTRADOR', tiposProyecto: opciones.tiposProyecto ?? [], demo, actualizarInsignias };
  construirMenu();

  const barra = document.getElementById('usuario-actual');
  barra.append(...[
    demo ? h('button', { type: 'button', class: 'boton boton-texto', text: 'Bandeja de correo de prueba', onClick: abrirBandeja }) : null,
    h('span', {}, h('strong', { text: usuario.nombre }), ' · ', h('span', { class: 'insignia insignia-oscura', text: usuario.rol === 'ADMINISTRADOR' ? 'Administrador' : 'Editor' })),
    h('a', { href: urlSitio, target: '_blank', rel: 'noopener', text: 'Ver sitio (se abre en otra pestaña)' }),
    h('button', {
      type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Cerrar sesión',
      onClick: async () => { try { await enviar('/api/auth/salir'); } catch (e) { anunciarError(e); } location.replace('./'); },
    }),
  ].filter(Boolean));

  botonMenu.addEventListener('click', () => {
    const abierto = menu.classList.toggle('abierto');
    botonMenu.setAttribute('aria-expanded', String(abierto));
    if (abierto) menu.querySelector('a')?.focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('abierto')) { menu.classList.remove('abierto'); botonMenu.setAttribute('aria-expanded', 'false'); botonMenu.focus(); }
  });
  window.addEventListener('hashchange', mostrar);
  await mostrar();
  actualizarInsignias();
}

iniciar();
