/**
 * Componentes del panel: selector de fotos/videos con subida, campo de foto
 * con texto alternativo, editor de fotos del proyecto y lista ordenable
 * (arrastrar con el ratón o mover con botones desde el teclado).
 */
import { obtener, subirArchivo } from './api.js';
import {
  abrirDialogo, anunciar, anunciarError, campo, formatoBytes, h, icono, idUnico, mostrarErrores, vaciar,
} from './ui.js';

const ALT_MINIMO = 8;
const MAX_IMAGEN = 10 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;

// ─── Selector de medios ────────────────────────────────────────────────
/**
 * Abre la biblioteca para elegir fotos o videos (o subir nuevos).
 * @returns {Promise<object[]|null>} medios elegidos o null si se cancela.
 */
export function elegirMedio({ tipo = 'IMAGEN', multiple = false, titulo } = {}) {
  return new Promise((resolver) => {
    let resultado = null;
    const seleccion = new Map();
    const esImagen = tipo === 'IMAGEN';
    const { cuerpo, pie, cerrar } = abrirDialogo({
      titulo: titulo ?? (esImagen ? (multiple ? 'Elegir fotos' : 'Elegir foto') : 'Elegir video'), tamano: 'ancho', alCerrar: () => resolver(resultado),
    });
    const rejilla = h('div', { class: 'rejilla-medios', role: 'group', 'aria-label': esImagen ? 'Fotos de la biblioteca' : 'Videos de la biblioteca' });
    const filtro = campo({ nombre: 'filtro', etiqueta: 'Buscar en la biblioteca', tipo: 'busqueda', ayuda: 'Por nombre del archivo o descripción.' });
    const usar = h('button', { type: 'button', class: 'boton boton-primario', text: multiple ? 'Usar las seleccionadas' : 'Usar la seleccionada', disabled: true });
    const contador = h('span', { class: 'texto-suave texto-pequeno', role: 'status' });
    let medios = [];

    function actualizarSeleccion() {
      usar.disabled = seleccion.size === 0;
      contador.textContent = seleccion.size ? `${seleccion.size} seleccionada${seleccion.size === 1 ? '' : 's'}` : '';
    }

    function pintar() {
      const termino = filtro.querySelector('input').value.trim().toLowerCase();
      vaciar(rejilla);
      const visibles = medios.filter((m) => !termino || `${m.nombre} ${m.alt ?? ''}`.toLowerCase().includes(termino));
      if (!visibles.length) rejilla.append(h('p', { class: 'vacio', text: 'No hay archivos que coincidan.' }));
      for (const m of visibles) {
        const listo = m.estado === 'LISTO';
        const boton = h('button', {
          type: 'button', class: 'medio-elegible', 'aria-pressed': String(seleccion.has(m.id)), disabled: !listo,
          onClick: () => {
            if (seleccion.has(m.id)) seleccion.delete(m.id);
            else { if (!multiple) seleccion.clear(); seleccion.set(m.id, m); }
            for (const b of rejilla.querySelectorAll('.medio-elegible')) b.setAttribute('aria-pressed', String(seleccion.has(Number(b.dataset.id))));
            actualizarSeleccion();
          },
          dataset: { id: m.id },
        }, vistaMedio(m), h('span', { class: 'medio-cuerpo' },
          h('strong', { text: m.nombre }),
          h('span', { class: 'alt', text: esImagen ? (m.alt || 'Sin descripción') : estadoVideo(m) })));
        rejilla.append(boton);
      }
    }

    async function cargar() {
      medios = await obtener(`/api/admin/medios?tipo=${tipo}`);
      pintar();
    }

    filtro.querySelector('input').addEventListener('input', pintar);
    cuerpo.append(formularioSubida({
      tipo,
      alSubir: async (medio) => {
        await cargar();
        if (medio.estado === 'LISTO') {
          if (!multiple) seleccion.clear();
          seleccion.set(medio.id, medio);
          pintar();
          actualizarSeleccion();
        }
      },
    }), h('h3', { text: 'O elige de la biblioteca' }), filtro, rejilla);
    if (!esImagen) {
      cuerpo.append(h('p', { class: 'texto-pequeno texto-suave' }, 'Los videos nuevos tardan unos minutos en comprimirse. ',
        h('button', { type: 'button', class: 'boton boton-texto', text: 'Actualizar lista', onClick: () => cargar().catch(anunciarError) })));
    }
    usar.addEventListener('click', () => { resultado = [...seleccion.values()]; cerrar(); });
    pie.append(contador, h('button', { type: 'button', class: 'boton boton-secundario', text: 'Cancelar', onClick: () => cerrar() }), usar);
    cargar().catch(anunciarError);
  });
}

const estadoVideo = (m) => ({ LISTO: 'Listo', PROCESANDO: 'Comprimiendo… (espera unos minutos)', ERROR: `Error: ${m.error ?? 'vuelve a subirlo'}` })[m.estado];

export function vistaMedio(m) {
  const contenedor = h('span', { class: 'medio-vista' });
  if (m.tipo === 'IMAGEN') contenedor.append(h('img', { src: m.variantes?.['960'] ?? m.url, alt: '', loading: 'lazy' }));
  else if (m.variantes?.poster) contenedor.append(h('img', { src: m.variantes.poster, alt: '', loading: 'lazy' }));
  else contenedor.append(h('span', { class: 'texto-pequeno', text: m.estado === 'LISTO' ? 'Video' : 'Procesando…' }));
  return contenedor;
}

/** Formulario para subir una foto (con descripción obligatoria) o un video. */
export function formularioSubida({ tipo, alSubir }) {
  const esImagen = tipo === 'IMAGEN';
  const form = h('form', { class: 'tarjeta', novalidate: true });
  const archivo = campo({
    nombre: 'archivo', etiqueta: esImagen ? 'Foto nueva' : 'Video nuevo', tipo: 'archivo', requerido: true,
    aceptar: esImagen ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/quicktime,video/webm',
    ayuda: esImagen ? 'JPG, PNG o WebP de máximo 10 MB. Se convierte a WebP automáticamente.' : 'MP4, MOV o WebM de máximo 50 MB. Se comprime automáticamente.',
  });
  const alt = campo({
    nombre: 'alt', etiqueta: esImagen ? 'Descripción de la foto (texto alternativo)' : 'Descripción breve (opcional)', tipo: 'area', filas: 2, max: 250, requerido: esImagen,
    ayuda: esImagen ? 'Describe lo que se ve, como si se lo contaras a alguien que no puede verla. Ej.: «Fachada de casa campestre de dos pisos con terraza de madera».' : undefined,
  });
  const progreso = h('progress', { max: 100, value: 0, hidden: true, 'aria-label': 'Avance de la subida' });
  const boton = h('button', { type: 'submit', class: 'boton boton-oscuro', text: esImagen ? 'Subir foto' : 'Subir video' });
  form.append(h('h3', { text: esImagen ? 'Subir una foto' : 'Subir un video' }), archivo, alt, progreso, boton);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const entrada = archivo.querySelector('input');
    const texto = alt.querySelector('textarea').value.trim();
    const f = entrada.files[0];
    const detalles = {};
    if (!f) detalles.archivo = 'Elige un archivo.';
    else if (esImagen && f.size > MAX_IMAGEN) detalles.archivo = `La foto pesa ${formatoBytes(f.size)}; el máximo es 10 MB.`;
    else if (!esImagen && f.size > MAX_VIDEO) detalles.archivo = `El video pesa ${formatoBytes(f.size)}; el máximo es 50 MB.`;
    if (esImagen && texto.length < ALT_MINIMO) detalles.alt = `Escribe al menos ${ALT_MINIMO} caracteres que describan la foto.`;
    if (Object.keys(detalles).length) return mostrarErrores(form, { message: 'Revisa los campos marcados.', detalles });
    boton.disabled = true;
    progreso.hidden = false;
    try {
      const medio = await subirArchivo(f, texto, (p) => { progreso.value = p; });
      form.reset();
      form.querySelector('.resumen-errores')?.remove();
      anunciar(medio.estado === 'PROCESANDO' ? 'Video recibido. Se está comprimiendo; estará listo en unos minutos.' : 'Foto subida y convertida a WebP.');
      await alSubir?.(medio);
    } catch (error) {
      mostrarErrores(form, error);
    } finally {
      boton.disabled = false;
      progreso.hidden = true;
      progreso.value = 0;
    }
  });
  return form;
}

// ─── Campo de una foto con texto alternativo ───────────────────────────
/**
 * @param {object} o
 * @param {string} o.nombreId   nombre del campo del id (p. ej. fotoId)
 * @param {string} o.nombreAlt  nombre del campo del texto alternativo
 */
export function campoFoto({ nombreId, nombreAlt, etiqueta, medio, alt, opcional = true }) {
  const oculto = h('input', { type: 'hidden', name: nombreId, value: medio?.id ?? '' });
  const vista = h('div', { class: 'vista-previa-imagen' });
  const campoAlt = campo({
    nombre: nombreAlt, etiqueta: 'Descripción de la foto (texto alternativo)', tipo: 'area', filas: 2, max: 250, valor: alt ?? '', requerido: !opcional,
    ayuda: 'Obligatoria si hay foto. Describe lo que se ve.',
  });
  const contenedor = h('fieldset', { dataset: { campo: nombreId } }, h('legend', { text: etiqueta }), oculto, vista, h('span', { class: 'error-campo', id: idUnico('error') }), campoAlt);
  const botonElegir = h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno' });

  function pintar(m) {
    vaciar(vista);
    if (m) vista.append(h('img', { src: m.variantes?.['960'] ?? m.url, alt: '' }));
    else vista.append(h('span', { class: 'texto-suave', text: 'Sin foto' }));
    botonElegir.textContent = m ? 'Cambiar foto' : 'Elegir foto';
    vista.append(botonElegir);
    if (m && opcional) {
      vista.append(h('button', {
        type: 'button', class: 'boton boton-peligro boton-pequeno', text: 'Quitar foto',
        onClick: () => { oculto.value = ''; pintar(null); anunciar('Foto quitada.'); botonElegir.focus(); },
      }));
    }
  }
  botonElegir.addEventListener('click', async () => {
    const elegidos = await elegirMedio({ tipo: 'IMAGEN' });
    if (!elegidos?.length) return;
    const m = elegidos[0];
    oculto.value = m.id;
    const area = campoAlt.querySelector('textarea');
    if (!area.value.trim() && m.alt) area.value = m.alt;
    area.dispatchEvent(new Event('input'));
    pintar(m);
    anunciar('Foto elegida. Revisa su descripción.');
    area.focus();
  });
  pintar(medio);
  return contenedor;
}

// ─── Campo de video ────────────────────────────────────────────────────
export function campoVideo({ nombre, etiqueta, medio }) {
  const oculto = h('input', { type: 'hidden', name: nombre, value: medio?.id ?? '' });
  const info = h('p', { class: 'texto-pequeno' });
  const contenedor = h('fieldset', { dataset: { campo: nombre } }, h('legend', {}, etiqueta, h('span', { class: 'obligatorio', 'aria-hidden': 'true', text: ' *' })), oculto, info);
  const boton = h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', id: idUnico('elegir-video') });
  const error = h('span', { class: 'error-campo' });
  function pintar(m) {
    info.textContent = m ? `${m.nombre} · ${formatoBytes(m.bytes)}${m.duracion ? ` · ${Math.round(m.duracion)} s` : ''}` : 'Ningún video elegido.';
    boton.textContent = m ? 'Cambiar video' : 'Elegir video';
  }
  boton.addEventListener('click', async () => {
    const elegidos = await elegirMedio({ tipo: 'VIDEO' });
    if (!elegidos?.length) return;
    oculto.value = elegidos[0].id;
    pintar(elegidos[0]);
    anunciar('Video elegido.');
  });
  contenedor.append(boton, error);
  pintar(medio);
  return contenedor;
}

// ─── Editor de fotos del proyecto ──────────────────────────────────────
export function editorImagenes({ imagenes = [] }) {
  let lista = imagenes.map((i) => ({ medioId: i.medioId, alt: i.alt, url: i.variantes?.['960'] ?? i.url }));
  const ul = h('ul', { class: 'imagenes-proyecto' });
  const agregar = h('button', { type: 'button', class: 'boton boton-secundario', text: 'Agregar fotos' });
  const contenedor = h('fieldset', { dataset: { campo: 'imagenes' } },
    h('legend', {}, 'Fotos del proyecto', h('span', { class: 'obligatorio', 'aria-hidden': 'true', text: ' *' })),
    h('p', { class: 'texto-suave texto-pequeno', text: 'Entre 1 y 12 fotos. La primera es la portada en el carrusel. Cada foto necesita su descripción.' }),
    ul, agregar, h('span', { class: 'error-campo' }));

  function pintar(enfocar) {
    vaciar(ul);
    lista.forEach((img, i) => {
      const area = campo({ nombre: `imagenes.${i}.alt`, etiqueta: `Descripción de la foto ${i + 1}`, tipo: 'area', filas: 2, max: 250, valor: img.alt, requerido: true });
      const control = area.querySelector('textarea');
      control.dataset.ignorar = 'si';
      control.addEventListener('input', () => { img.alt = control.value; });
      const mover = (d) => {
        const j = i + d;
        [lista[i], lista[j]] = [lista[j], lista[i]];
        pintar({ indice: j, accion: d < 0 ? 'subir' : 'bajar' });
        anunciar(`Foto movida a la posición ${j + 1} de ${lista.length}.`);
      };
      ul.append(h('li', {}, h('img', { src: img.url, alt: '' }), h('div', {}, area, h('div', { class: 'grupo-botones' },
        h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', dataset: { accion: 'subir' }, text: 'Subir', 'aria-label': `Subir foto ${i + 1}`, disabled: i === 0, onClick: () => mover(-1) }),
        h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', dataset: { accion: 'bajar' }, text: 'Bajar', 'aria-label': `Bajar foto ${i + 1}`, disabled: i === lista.length - 1, onClick: () => mover(1) }),
        h('button', {
          type: 'button', class: 'boton boton-peligro boton-pequeno', text: 'Quitar', 'aria-label': `Quitar foto ${i + 1}`,
          onClick: () => { lista.splice(i, 1); pintar({ indice: Math.min(i, lista.length - 1), accion: 'quitar' }); anunciar('Foto quitada del proyecto.'); },
        })))));
    });
    if (!lista.length) ul.append(h('li', { class: 'texto-suave', text: 'Todavía no hay fotos.' }));
    agregar.disabled = lista.length >= 12;
    if (enfocar) {
      const li = ul.children[enfocar.indice];
      const destino = li?.querySelector(`[data-accion="${enfocar.accion}"]:not(:disabled)`) ?? li?.querySelector('textarea') ?? agregar;
      destino.focus();
    }
  }
  agregar.addEventListener('click', async () => {
    const elegidos = await elegirMedio({ tipo: 'IMAGEN', multiple: true, titulo: 'Agregar fotos al proyecto' });
    if (!elegidos?.length) return;
    for (const m of elegidos.slice(0, 12 - lista.length)) lista.push({ medioId: m.id, alt: m.alt ?? '', url: m.variantes?.['960'] ?? m.url });
    pintar({ indice: lista.length - 1, accion: 'quitar' });
    anunciar(`${elegidos.length} foto(s) agregada(s). Revisa sus descripciones.`);
  });
  pintar();
  return { elemento: contenedor, valor: () => lista.map(({ medioId, alt }) => ({ medioId, alt })) };
}

// ─── Lista ordenable ───────────────────────────────────────────────────
/**
 * Lista que se ordena arrastrando (ratón) o con botones Subir/Bajar
 * (teclado y pantallas táctiles). Anuncia cada movimiento.
 * @param {object} o
 * @param {object[]} o.elementos
 * @param {(item) => {miniatura?:Node, titulo:string, detalle?:string, oculto?:boolean, acciones:Node[]}} o.pintar
 * @param {(ids:number[]) => Promise} o.alOrdenar
 * @param {string} o.etiqueta nombre accesible de la lista
 */
export function listaOrdenable({ elementos, pintar, alOrdenar, etiqueta }) {
  let orden = [...elementos];
  const ul = h('ul', { class: 'lista-ordenable', 'aria-label': etiqueta });
  let arrastrado = null;

  async function guardar(nuevo, mensaje, foco) {
    const anterior = orden;
    orden = nuevo;
    render(foco);
    try {
      await alOrdenar(orden.map((e) => e.id));
      anunciar(mensaje);
    } catch (error) {
      orden = anterior;
      render();
      anunciarError(error);
    }
  }

  function mover(desde, hasta, foco) {
    if (hasta < 0 || hasta >= orden.length || desde === hasta) return;
    const nuevo = [...orden];
    const [item] = nuevo.splice(desde, 1);
    nuevo.splice(hasta, 0, item);
    const datos = pintar(item);
    guardar(nuevo, `«${datos.titulo}» quedó en la posición ${hasta + 1} de ${nuevo.length}.`, foco ? { id: item.id, accion: foco } : null);
  }

  function render(foco) {
    vaciar(ul);
    orden.forEach((item, i) => {
      const datos = pintar(item);
      const asa = h('span', { class: 'asa', title: 'Arrastra para cambiar el orden', 'aria-hidden': 'true' }, icono('asa'));
      const li = h('li', { class: `elemento ${datos.oculto ? 'oculto-publico' : ''}`, dataset: { id: item.id } },
        asa,
        datos.miniatura ?? h('span', { class: 'miniatura', text: String(i + 1) }),
        h('div', { class: 'elemento-texto' }, h('strong', { text: datos.titulo }),
          h('span', {}, `Posición ${i + 1}`, datos.detalle ? ` · ${datos.detalle}` : '', datos.oculto ? ' · ' : '', datos.oculto ? h('span', { class: 'insignia insignia-aviso', text: 'Oculto en el sitio' }) : null)),
        h('div', { class: 'elemento-acciones' },
          h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno boton-icono', dataset: { accion: 'subir' }, 'aria-label': `Subir «${datos.titulo}»`, title: 'Subir', disabled: i === 0, onClick: () => mover(i, i - 1, 'subir') }, icono('arriba')),
          h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno boton-icono', dataset: { accion: 'bajar' }, 'aria-label': `Bajar «${datos.titulo}»`, title: 'Bajar', disabled: i === orden.length - 1, onClick: () => mover(i, i + 1, 'bajar') }, icono('abajo')),
          ...datos.acciones));
      // Arrastrar solo desde el asa, para no interferir con los botones.
      asa.addEventListener('pointerdown', () => { li.draggable = true; });
      li.addEventListener('dragstart', (e) => { arrastrado = i; li.classList.add('arrastrando'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(item.id)); });
      li.addEventListener('dragend', () => { li.draggable = false; li.classList.remove('arrastrando'); for (const x of ul.children) x.classList.remove('destino'); });
      li.addEventListener('dragover', (e) => { if (arrastrado === null) return; e.preventDefault(); li.classList.add('destino'); });
      li.addEventListener('dragleave', () => li.classList.remove('destino'));
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('destino');
        const desde = arrastrado;
        arrastrado = null;
        if (desde !== null) mover(desde, i);
      });
      ul.append(li);
    });
    if (foco) {
      const li = ul.querySelector(`[data-id="${foco.id}"]`);
      (li?.querySelector(`[data-accion="${foco.accion}"]:not(:disabled)`) ?? li?.querySelector('button:not(:disabled)'))?.focus();
    }
  }
  render();
  return ul;
}
