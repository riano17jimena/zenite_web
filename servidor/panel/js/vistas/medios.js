/** Biblioteca de fotos y videos: subir, editar descripciones y eliminar los que no se usan. */
import { eliminar, modificar, obtener } from '../api.js';
import { formularioSubida, vistaMedio } from '../componentes.js';
import {
  abrirDialogo, anunciar, anunciarError, campo, confirmar, conBotonOcupado, formatoBytes, formatoFecha, h, mostrarErrores, pestanas,
} from '../ui.js';
import { encabezado } from './comun.js';

export async function mostrar(contenedor, ctx) {
  contenedor.append(
    encabezado(ctx.titulo, 'Todas las fotos y videos del sitio. Las fotos se convierten a WebP (máx. 10 MB) y los videos se comprimen (máx. 50 MB). Cada foto debe tener su descripción.'),
    pestanas({
      etiqueta: 'Tipo de archivo',
      opciones: [{ texto: 'Fotos', tipo: 'IMAGEN' }, { texto: 'Videos', tipo: 'VIDEO' }],
      alElegir: (o, panel) => pintarTipo(o.tipo, panel).catch(anunciarError),
    }),
  );
}

async function pintarTipo(tipo, panel) {
  const rejilla = h('div', { class: 'rejilla-medios' });
  panel.append(formularioSubida({ tipo, alSubir: () => cargar() }), h('h2', { text: tipo === 'IMAGEN' ? 'Fotos en la biblioteca' : 'Videos en la biblioteca' }), rejilla);
  let temporizador = null;

  async function cargar() {
    const medios = await obtener(`/api/admin/medios?tipo=${tipo}`);
    rejilla.replaceChildren();
    if (!medios.length) rejilla.append(h('p', { class: 'vacio', text: 'Todavía no hay archivos.' }));
    for (const m of medios) rejilla.append(tarjeta(m, cargar));
    clearTimeout(temporizador);
    if (medios.some((m) => m.estado === 'PROCESANDO') && document.contains(rejilla)) temporizador = setTimeout(() => cargar().catch(() => {}), 8000);
  }
  await cargar();
}

function tarjeta(m, recargar) {
  const estado = { LISTO: ['Listo', 'insignia-exito'], PROCESANDO: ['Comprimiendo…', 'insignia-aviso'], ERROR: ['Error', 'insignia-error'] }[m.estado];
  return h('article', { class: 'medio' }, vistaMedio(m), h('div', { class: 'medio-cuerpo' },
    h('h3', { class: 'texto-pequeno', text: m.nombre }),
    h('span', {}, h('span', { class: `insignia ${estado[1]}`, text: estado[0] }), ` ${formatoBytes(m.bytes)}${m.ancho ? ` · ${m.ancho}×${m.alto}` : ''}`),
    m.tipo === 'IMAGEN' ? h('p', { class: 'alt' }, h('span', { class: 'visualmente-oculto', text: 'Descripción: ' }), m.alt || 'Sin descripción') : null,
    m.error ? h('p', { class: 'texto-pequeno', text: m.error }) : null,
    h('div', { class: 'grupo-botones' },
      h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Detalles', 'aria-label': `Detalles de ${m.nombre}`, onClick: () => detalles(m, recargar) }),
      h('button', {
        type: 'button', class: 'boton boton-peligro boton-pequeno', text: 'Eliminar', 'aria-label': `Eliminar ${m.nombre}`,
        onClick: async () => {
          if (!(await confirmar({ titulo: 'Eliminar archivo', mensaje: `¿Eliminar «${m.nombre}» de la biblioteca?`, detalle: 'Si está en uso en alguna sección, primero debes quitarlo de allí.', aceptar: 'Eliminar', peligro: true }))) return;
          try { await eliminar(`/api/admin/medios/${m.id}`); anunciar('Archivo eliminado.'); await recargar(); } catch (e) { anunciarError(e); }
        },
      }))));
}

async function detalles(m, recargar) {
  const info = await obtener(`/api/admin/medios/${m.id}`);
  const { cuerpo, pie, cerrar } = abrirDialogo({ titulo: m.nombre });
  const vista = m.tipo === 'IMAGEN'
    ? h('img', { src: info.url, alt: info.alt ?? '' })
    : h('video', { src: info.url, poster: info.variantes?.poster, controls: true, preload: 'metadata' });
  cuerpo.append(vista,
    h('p', { class: 'texto-pequeno texto-suave', text: `${formatoBytes(info.bytes)} · subido ${formatoFecha(info.creado)}` }),
    h('p', {}, h('strong', { text: 'Dónde se usa: ' }), info.usos.length ? info.usos.join('; ') : 'en ninguna sección.'),
    h('p', { class: 'texto-pequeno' }, h('a', { href: info.url, target: '_blank', rel: 'noopener', text: 'Abrir el archivo (otra pestaña)' })));
  const form = h('form', { novalidate: true, id: 'form-alt' });
  form.append(campo({ nombre: 'alt', etiqueta: m.tipo === 'IMAGEN' ? 'Descripción (texto alternativo)' : 'Descripción', tipo: 'area', filas: 3, max: 250, valor: info.alt ?? '', requerido: m.tipo === 'IMAGEN' }));
  cuerpo.append(form);
  const guardar = h('button', { type: 'submit', form: 'form-alt', class: 'boton boton-primario', text: 'Guardar descripción' });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await conBotonOcupado(guardar, () => modificar(`/api/admin/medios/${m.id}`, { alt: form.elements.alt.value }));
      cerrar();
      anunciar('Descripción guardada. Para cambiarla en una sección ya creada, edítala también allí.');
      await recargar();
    } catch (error) { mostrarErrores(form, error); }
  });
  pie.append(h('button', { type: 'button', class: 'boton boton-secundario', text: 'Cerrar', onClick: () => cerrar() }), guardar);
}
