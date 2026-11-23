/** Respaldos: explicación del respaldo automático y descarga manual. */
import { descargar } from '../api.js';
import { anunciar, anunciarError, campo, conBotonOcupado, h } from '../ui.js';
import { encabezado } from './comun.js';

export async function mostrar(contenedor, ctx) {
  const form = h('form', { class: 'tarjeta', 'aria-labelledby': 't-descarga' }, h('h2', { id: 't-descarga', text: 'Descargar un respaldo ahora' }),
    h('p', { text: 'Archivo JSON con el contenido del sitio, las publicaciones, el catálogo de servicios y la configuración del cotizador.' }),
    campo({ nombre: 'precios', etiqueta: 'Incluir la base de precios (actividades, insumos y APU)', tipo: 'casilla', ayuda: 'Archivo más grande. La base tiene licencia de uso exclusivo: no la compartas.' }),
    campo({ nombre: 'solicitudes', etiqueta: 'Incluir solicitudes y cotizaciones (datos personales)', tipo: 'casilla', ayuda: 'Guárdalo en un lugar seguro y bórralo cuando ya no lo necesites (Ley 1581).' }));
  const boton = h('button', { type: 'submit', class: 'boton boton-primario', text: 'Descargar respaldo' });
  form.append(boton);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = new URLSearchParams();
    if (form.elements.precios.checked) q.set('precios', '1');
    if (form.elements.solicitudes.checked) q.set('solicitudes', '1');
    try { const n = await conBotonOcupado(boton, () => descargar(`/api/admin/respaldo?${q}`, 'zenite-respaldo.json'), 'Preparando…'); anunciar(`Respaldo descargado: ${n}.`); } catch (error) { anunciarError(error); }
  });
  contenedor.append(encabezado(ctx.titulo, 'Copias de seguridad de la información del sitio.'),
    h('section', { class: 'tarjeta', 'aria-labelledby': 't-auto' }, h('h2', { id: 't-auto', text: 'Respaldo automático' }),
      h('ul', {},
        h('li', { text: 'Cada domingo a las 3:00 a. m. se hace una copia completa de la base de datos (GitHub Actions). Se conservan las de los últimos 90 días.' }),
        h('li', { text: 'Supabase guarda además copias diarias de los últimos 7 días (plan Pro) y las fotos y videos quedan en Supabase Storage.' }),
        h('li', { text: 'Recomendación: descarga un respaldo manual completo una vez al mes y guárdalo fuera de internet.' }))),
    form);
}
