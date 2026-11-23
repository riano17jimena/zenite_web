/**
 * CRUD genérico de las secciones del sitio: portafolio, videos, testimonios,
 * preguntas frecuentes, datos de contacto y perfil del arquitecto.
 * Incluye ordenar (arrastrar o botones), ocultar sin borrar, editar y eliminar.
 */
import { eliminar, enviar, modificar, obtener, reemplazar } from '../api.js';
import { campoFoto, campoVideo, editorImagenes, listaOrdenable } from '../componentes.js';
import {
  abrirDialogo, anunciar, anunciarError, campo, confirmar, conBotonOcupado, h, leerFormulario, mostrarErrores,
} from '../ui.js';
import { avisoBorrador, encabezado } from './comun.js';

const TIPOS_CONTACTO = [
  { valor: 'WHATSAPP', texto: 'WhatsApp' }, { valor: 'TELEFONO', texto: 'Teléfono' }, { valor: 'CORREO', texto: 'Correo' },
  { valor: 'INSTAGRAM', texto: 'Instagram' }, { valor: 'DIRECCION', texto: 'Dirección' }, { valor: 'HORARIO', texto: 'Horario' }, { valor: 'OTRO', texto: 'Otro' },
];

const visible = { nombre: 'visible', etiqueta: 'Mostrar en el sitio', tipo: 'casilla', ayuda: 'Si lo desmarcas se oculta sin borrarse.', porDefecto: true };

/** Configuración de cada sección: textos, cómo se resume en la lista y sus campos. */
const SECCIONES = {
  proyectos: {
    singular: 'proyecto', nuevo: 'Agregar proyecto',
    descripcion: 'Proyectos del carrusel del portafolio. El orden de la lista es el orden en el sitio.',
    resumen: (p, ctx) => ({ titulo: p.titulo, detalle: [ctx.nombreTipo(p.categoria), p.ubicacion, `${p.imagenes.length} foto(s)`, p.destacado ? 'Destacado' : null].filter(Boolean).join(' · '), imagen: p.imagenes[0] }),
    campos: (ctx) => [
      { nombre: 'titulo', etiqueta: 'Título', requerido: true, max: 120 },
      { nombre: 'categoria', etiqueta: 'Tipo de proyecto', tipo: 'seleccion', requerido: true, opciones: [{ valor: '', texto: 'Elige una opción' }, ...ctx.tiposProyecto.map((t) => ({ valor: t.clave, texto: t.nombre }))] },
      { fila: [{ nombre: 'ubicacion', etiqueta: 'Ubicación', max: 120, ayuda: 'Ej.: Tunja, Boyacá' }, { nombre: 'anio', etiqueta: 'Año', tipo: 'numero', paso: 'entero' }, { nombre: 'area', etiqueta: 'Área (m²)', tipo: 'numero', paso: 'entero' }] },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'area', requerido: true, max: 600 },
      { especial: 'imagenes' },
      { nombre: 'destacado', etiqueta: 'Proyecto destacado', tipo: 'casilla' },
      visible,
    ],
  },
  videos: {
    singular: 'video', nuevo: 'Agregar video',
    descripcion: 'Videos de la sección «Proyectos en movimiento». Cada video necesita título, descripción y, de preferencia, la transcripción.',
    resumen: (v) => ({ titulo: v.titulo, detalle: [v.etiqueta, v.duracionSeg ? `${v.duracionSeg} s` : null, v.transcripcion ? 'Con transcripción' : 'Sin transcripción'].filter(Boolean).join(' · '), imagenUrl: v.urlPoster }),
    campos: () => [
      { fila: [{ nombre: 'titulo', etiqueta: 'Título', requerido: true, max: 120 }, { nombre: 'etiqueta', etiqueta: 'Etiqueta', requerido: true, max: 40, ayuda: 'Ej.: Recorrido, Obra, Proceso' }] },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'area', requerido: true, max: 400 },
      { especial: 'video', nombre: 'archivoId', etiqueta: 'Archivo de video', medio: (v) => v?.archivo },
      { especial: 'foto', nombreId: 'posterId', nombreAlt: '_altPoster', etiqueta: 'Portada (opcional)', medio: (v) => v?.poster, sinAlt: true },
      { nombre: 'transcripcion', etiqueta: 'Transcripción o descripción del audio', tipo: 'area', filas: 5, max: 5000, ayuda: 'Ayuda a personas sordas y a quienes no pueden activar el sonido (WCAG 1.2).' },
      visible,
    ],
  },
  testimonios: {
    singular: 'testimonio', nuevo: 'Agregar testimonio',
    descripcion: 'Opiniones de clientes. Solo aparecen en el sitio si están visibles y marcadas como autorizadas por el cliente.',
    resumen: (t) => ({ titulo: t.nombre, detalle: [t.proyecto, t.ciudad, t.autorizado ? 'Autorizado' : 'Sin autorización: no se publica'].filter(Boolean).join(' · '), imagen: t.foto, ocultoExtra: !t.autorizado }),
    campos: () => [
      { fila: [{ nombre: 'nombre', etiqueta: 'Nombre de la persona', requerido: true, max: 80 }, { nombre: 'ciudad', etiqueta: 'Ciudad', max: 80 }] },
      { nombre: 'proyecto', etiqueta: 'Proyecto', requerido: true, max: 120, ayuda: 'Ej.: Casa campestre en Sora' },
      { nombre: 'comentario', etiqueta: 'Comentario', tipo: 'area', requerido: true, max: 600 },
      { especial: 'foto', nombreId: 'fotoId', nombreAlt: 'fotoAlt', etiqueta: 'Foto de la persona (opcional)', medio: (t) => t?.foto, alt: (t) => t?.fotoAlt },
      { nombre: 'autorizado', etiqueta: 'La persona autorizó publicar su nombre, comentario y foto', tipo: 'casilla', ayuda: 'Exigido por la Ley 1581 de 2012. Guarda el soporte de la autorización.' },
      visible,
    ],
  },
  preguntas: {
    singular: 'pregunta', nuevo: 'Agregar pregunta',
    descripcion: 'Preguntas frecuentes que se muestran en acordeón.',
    resumen: (p) => ({ titulo: p.pregunta, detalle: `${p.respuesta.slice(0, 90)}${p.respuesta.length > 90 ? '…' : ''}` }),
    campos: () => [
      { nombre: 'pregunta', etiqueta: 'Pregunta', requerido: true, max: 200 },
      { nombre: 'respuesta', etiqueta: 'Respuesta', tipo: 'area', requerido: true, max: 1500, filas: 6 },
      visible,
    ],
  },
  contactos: {
    singular: 'dato de contacto', nuevo: 'Agregar dato',
    descripcion: 'Teléfono, WhatsApp, correo, redes, dirección y horario que aparecen en el sitio.',
    resumen: (c) => ({ titulo: `${c.etiqueta}: ${c.valor}`, detalle: [TIPOS_CONTACTO.find((t) => t.valor === c.tipo)?.texto, c.enlace].filter(Boolean).join(' · ') }),
    campos: () => [
      { fila: [{ nombre: 'tipo', etiqueta: 'Tipo', tipo: 'seleccion', requerido: true, opciones: TIPOS_CONTACTO }, { nombre: 'etiqueta', etiqueta: 'Etiqueta', requerido: true, max: 40, ayuda: 'Ej.: WhatsApp' }] },
      { nombre: 'valor', etiqueta: 'Valor que se muestra', requerido: true, max: 200, ayuda: 'Ej.: 315 711 0946' },
      { nombre: 'enlace', etiqueta: 'Enlace (opcional)', max: 300, ayuda: 'Debe empezar por https://, mailto: o tel:. Ej.: https://wa.me/573157110946' },
      visible,
    ],
  },
  perfiles: {
    singular: 'perfil', nuevo: 'Agregar perfil',
    descripcion: 'Foto y perfil profesional del arquitecto (y de otros integrantes del equipo si los agregas).',
    resumen: (p) => ({ titulo: p.nombre, detalle: p.cargo, imagen: p.foto }),
    campos: () => [
      { fila: [{ nombre: 'nombre', etiqueta: 'Nombre completo', requerido: true, max: 80 }, { nombre: 'cargo', etiqueta: 'Cargo', requerido: true, max: 80 }] },
      { especial: 'foto', nombreId: 'fotoId', nombreAlt: 'fotoAlt', etiqueta: 'Foto', medio: (p) => p?.foto, alt: (p) => p?.fotoAlt },
      { nombre: 'lema', etiqueta: 'Frase o lema', max: 160 },
      { nombre: 'mision', etiqueta: 'Misión / presentación', tipo: 'area', max: 800 },
      { nombre: 'formacion', etiqueta: 'Formación', tipo: 'area', requerido: true, max: 400 },
      { nombre: 'trayectoria', etiqueta: 'Trayectoria', tipo: 'area', requerido: true, max: 600 },
      { nombre: 'experiencia', etiqueta: 'Experiencia destacada', tipo: 'area', max: 600 },
      visible,
    ],
  },
};

export async function mostrar(contenedor, ctx) {
  const nombre = ctx.recurso;
  const config = SECCIONES[nombre];
  const base = `/api/admin/${nombre}`;
  ctx.nombreTipo = (clave) => ctx.tiposProyecto.find((t) => t.clave === clave)?.nombre ?? clave;
  const zonaLista = h('div');
  const botonNuevo = h('button', { type: 'button', class: 'boton boton-primario', text: config.nuevo, onClick: () => abrirFormulario(null) });
  contenedor.append(encabezado(ctx.titulo, config.descripcion, botonNuevo), avisoBorrador(ctx.esAdmin), zonaLista);

  async function cargar(enfocarId) {
    const elementos = await obtener(base);
    zonaLista.replaceChildren();
    if (!elementos.length) {
      zonaLista.append(h('p', { class: 'vacio', text: `Todavía no hay elementos. Usa «${config.nuevo}».` }));
      return;
    }
    zonaLista.append(h('p', { class: 'texto-suave texto-pequeno', text: 'Arrastra desde el asa (⋮⋮) o usa los botones de flecha para cambiar el orden. El cambio se guarda al instante.' }),
      listaOrdenable({
        etiqueta: ctx.titulo,
        elementos,
        alOrdenar: (ids) => reemplazar(`${base}/orden`, { ids }),
        pintar: (item) => {
          const r = config.resumen(item, ctx);
          const url = r.imagen ? (r.imagen.variantes?.['960'] ?? r.imagen.url) : r.imagenUrl;
          return {
            titulo: r.titulo,
            detalle: r.detalle,
            oculto: !item.visible || r.ocultoExtra,
            miniatura: url ? h('img', { class: 'miniatura', src: url, alt: '' }) : null,
            acciones: [
              h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Editar', 'aria-label': `Editar «${r.titulo}»`, onClick: () => abrirFormulario(item) }),
              h('button', {
                type: 'button', class: 'boton boton-secundario boton-pequeno', text: item.visible ? 'Ocultar' : 'Mostrar', 'aria-label': `${item.visible ? 'Ocultar' : 'Mostrar'} «${r.titulo}» en el sitio`,
                onClick: async () => {
                  try {
                    await modificar(`${base}/${item.id}/visible`, { visible: !item.visible });
                    anunciar(item.visible ? `«${r.titulo}» quedó oculto (no se borró).` : `«${r.titulo}» volverá a mostrarse.`);
                    await cargar(item.id);
                  } catch (e) { anunciarError(e); }
                },
              }),
              h('button', {
                type: 'button', class: 'boton boton-peligro boton-pequeno', text: 'Eliminar', 'aria-label': `Eliminar «${r.titulo}»`,
                onClick: async () => {
                  const ok = await confirmar({ titulo: `Eliminar ${config.singular}`, mensaje: `¿Eliminar «${r.titulo}»? Esta acción no se puede deshacer.`, detalle: 'Si solo quieres que no se vea, usa «Ocultar».', aceptar: 'Eliminar', peligro: true });
                  if (!ok) return;
                  try { await eliminar(`${base}/${item.id}`); anunciar(`Eliminaste «${r.titulo}».`); await cargar(); botonNuevo.focus(); } catch (e) { anunciarError(e); }
                },
              }),
            ],
          };
        },
      }));
    if (enfocarId) zonaLista.querySelector(`[data-id="${enfocarId}"] button`)?.focus();
  }

  function abrirFormulario(item) {
    const titulo = item ? `Editar ${config.singular}` : config.nuevo;
    const { cuerpo, pie, cerrar } = abrirDialogo({ titulo, tamano: nombre === 'proyectos' || nombre === 'perfiles' ? 'ancho' : '' });
    const form = h('form', { novalidate: true, id: `form-${nombre}` });
    let imagenes = null;
    const crearCampo = (c) => {
      if (c.fila) return h('div', { class: 'fila-campos' }, c.fila.map(crearCampo));
      if (c.especial === 'imagenes') { imagenes = editorImagenes({ imagenes: item?.imagenes ?? [] }); return imagenes.elemento; }
      if (c.especial === 'video') return campoVideo({ nombre: c.nombre, etiqueta: c.etiqueta, medio: c.medio(item) });
      if (c.especial === 'foto') {
        const f = campoFoto({ nombreId: c.nombreId, nombreAlt: c.nombreAlt, etiqueta: c.etiqueta, medio: c.medio(item), alt: c.alt?.(item) ?? c.medio(item)?.alt });
        if (c.sinAlt) { const alt = f.querySelector(`[data-campo="${c.nombreAlt}"]`); alt.hidden = true; alt.querySelector('textarea').dataset.ignorar = 'si'; }
        return f;
      }
      const valor = item ? item[c.nombre] : (c.porDefecto ?? '');
      return campo({ ...c, valor: valor ?? '' });
    };
    form.append(...config.campos(ctx).map(crearCampo));
    cuerpo.append(h('p', { class: 'texto-suave texto-pequeno' }, 'Los campos con ', h('span', { class: 'obligatorio', text: '*' }), ' son obligatorios.'), form);
    const guardar = h('button', { type: 'submit', form: form.id, class: 'boton boton-primario', text: item ? 'Guardar cambios' : 'Guardar' });
    pie.append(h('button', { type: 'button', class: 'boton boton-secundario', text: 'Cancelar', onClick: () => cerrar() }), guardar);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const datos = leerFormulario(form);
      if (imagenes) datos.imagenes = imagenes.valor();
      try {
        const r = await conBotonOcupado(guardar, () => (item ? reemplazar(`${base}/${item.id}`, datos) : enviar(base, datos)));
        cerrar();
        anunciar(item ? 'Cambios guardados en el borrador.' : `${config.singular[0].toUpperCase()}${config.singular.slice(1)} agregado al borrador.`);
        await cargar(r.id);
      } catch (error) { mostrarErrores(form, error); }
    });
  }

  await cargar();
}
