/** Página de inicio del panel: estado de publicación, accesos rápidos y solicitudes nuevas. */
import { obtener } from '../api.js';
import { formatoFecha, h } from '../ui.js';
import { encabezado } from './comun.js';

const NOMBRES = { proyectos: ['Portafolio', 'portafolio'], videos: ['Videos', 'videos'], testimonios: ['Testimonios', 'testimonios'], preguntas: ['Preguntas frecuentes', 'preguntas'], contactos: ['Datos de contacto', 'contacto'], perfiles: ['Perfil del arquitecto', 'perfil'] };

export async function mostrar(contenedor, ctx) {
  const r = await obtener('/api/admin/resumen');
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  contenedor.append(encabezado(`${saludo}, ${ctx.usuario.nombre.split(' ')[0]}`, 'Desde aquí administras el contenido del sitio de Zenite Arquitectura.'));

  contenedor.append(h('section', { class: 'tarjeta', 'aria-labelledby': 't-pub' }, h('h2', { id: 't-pub', text: 'Publicación' }),
    r.publicacion.hayCambios
      ? h('p', {}, h('span', { class: 'insignia insignia-aviso', text: 'Cambios sin publicar' }), ' Hay cambios en el borrador. ', h('a', { href: '#/publicar', text: 'Revisar y publicar' }))
      : h('p', {}, h('span', { class: 'insignia insignia-exito', text: 'Al día' }), ' El sitio muestra todo lo que hay en el borrador.'),
    r.publicacion.ultima ? h('p', { class: 'texto-suave texto-pequeno', text: `Última publicación: versión ${r.publicacion.ultima.version}, ${formatoFecha(r.publicacion.ultima.publicada)}.` }) : null));

  contenedor.append(h('h2', { text: 'Secciones del sitio' }), h('ul', { class: 'rejilla', role: 'list' },
    Object.entries(r.secciones).map(([clave, total]) => h('li', { class: 'tarjeta' },
      h('h3', {}, h('a', { href: `#/${NOMBRES[clave][1]}`, text: NOMBRES[clave][0] })),
      h('p', { class: 'dato-grande', text: total }), h('p', { class: 'texto-suave texto-pequeno', text: total === 1 ? 'elemento' : 'elementos' })))));

  if (r.solicitudes) {
    contenedor.append(h('section', { class: 'tarjeta', 'aria-labelledby': 't-sol' }, h('h2', { id: 't-sol', text: 'Solicitudes de clientes' }),
      h('p', {}, h('strong', { text: `${r.solicitudes.nuevas} nueva${r.solicitudes.nuevas === 1 ? '' : 's'}` }), ` de ${r.solicitudes.total} en total. `, h('a', { href: '#/solicitudes', text: 'Ver solicitudes' })),
      r.solicitudes.recientes.length ? h('ul', {}, r.solicitudes.recientes.map((s) => h('li', { text: `${formatoFecha(s.creada)} · ${s.nombre} · ${s.origen === 'COTIZADOR' ? 'Cotización' : 'Formulario'}${s.estado === 'NUEVA' ? ' · nueva' : ''}` }))) : null));
  }
}
