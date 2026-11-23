/**
 * Utilidades de interfaz accesibles: creación de elementos sin innerHTML,
 * anuncios para lectores de pantalla, diálogos, campos de formulario con
 * errores asociados y formatos en español de Colombia.
 */

/** Crea un elemento. props: class, text, html (no usar con datos del usuario), on*, attrs, dataset. */
export function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(props ?? {})) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (clave === 'class') el.className = valor;
    else if (clave === 'text') el.textContent = valor;
    else if (clave === 'dataset') Object.assign(el.dataset, valor);
    else if (clave.startsWith('on') && typeof valor === 'function') el.addEventListener(clave.slice(2).toLowerCase(), valor);
    else if (clave in el && typeof valor !== 'string') el[clave] = valor;
    else el.setAttribute(clave, valor === true ? '' : String(valor));
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

export const vaciar = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

let contador = 0;
export const idUnico = (prefijo = 'id') => `${prefijo}-${++contador}`;

// ─── Anuncios ──────────────────────────────────────────────────────────
function regionViva() {
  let region = document.getElementById('anuncios');
  if (!region) {
    region = h('div', { id: 'anuncios', class: 'visualmente-oculto', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.append(region);
  }
  return region;
}

/** Anuncia un mensaje al lector de pantalla y lo muestra unos segundos. */
export function anunciar(mensaje, { tipo = 'exito', visible = true } = {}) {
  const region = regionViva();
  region.textContent = '';
  setTimeout(() => { region.textContent = mensaje; }, 60);
  if (!visible) return;
  let avisos = document.querySelector('.avisos');
  if (!avisos) { avisos = h('div', { class: 'avisos', 'aria-hidden': 'true' }); document.body.append(avisos); }
  const aviso = h('div', { class: `aviso ${tipo === 'error' ? 'error' : ''}`, text: mensaje });
  avisos.append(aviso);
  setTimeout(() => aviso.remove(), tipo === 'error' ? 8000 : 4500);
}

export const anunciarError = (error) => anunciar(error?.message ?? String(error), { tipo: 'error' });

// ─── Formatos ──────────────────────────────────────────────────────────
const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const formatoCOP = (n) => (n == null || Number.isNaN(Number(n)) ? '—' : cop.format(Number(n)));
const numeroFormato = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });
export const formatoNumero = (n) => (n == null ? '—' : numeroFormato.format(Number(n)));
const fechaHora = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });
export const formatoFecha = (f) => (f ? fechaHora.format(new Date(f)) : '—');
export const formatoBytes = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// ─── Diálogos ──────────────────────────────────────────────────────────
/**
 * Abre un diálogo modal accesible (el navegador mantiene el foco dentro y
 * Esc lo cierra). Devuelve { dialogo, cuerpo, pie, cerrar }.
 */
export function abrirDialogo({ titulo, tamano = '', alCerrar } = {}) {
  const idTitulo = idUnico('titulo-dialogo');
  const origen = document.activeElement;
  const cuerpo = h('div', { class: 'dialogo-cuerpo' });
  const pie = h('div', { class: 'dialogo-pie' });
  const cerrarBoton = h('button', { type: 'button', class: 'boton boton-texto', text: 'Cerrar', 'aria-label': `Cerrar: ${titulo}` });
  const dialogo = h('dialog', { class: `dialogo ${tamano}`, 'aria-labelledby': idTitulo },
    h('div', { class: 'dialogo-cabecera' }, h('h2', { id: idTitulo, text: titulo }), cerrarBoton), cuerpo, pie);
  document.body.append(dialogo);
  const cerrar = (valor) => { if (dialogo.open) dialogo.close(valor ?? ''); };
  cerrarBoton.addEventListener('click', () => cerrar());
  dialogo.addEventListener('close', () => {
    alCerrar?.(dialogo.returnValue);
    dialogo.remove();
    if (origen && document.contains(origen)) origen.focus();
  });
  dialogo.showModal();
  requestAnimationFrame(() => {
    const primero = cuerpo.querySelector('input:not([type="hidden"]):not([disabled]), select, textarea, button');
    (primero ?? cerrarBoton).focus();
  });
  return { dialogo, cuerpo, pie, cerrar };
}

/** Pide confirmación. Devuelve una promesa con true/false. */
export function confirmar({ titulo, mensaje, aceptar = 'Aceptar', peligro = false, detalle }) {
  return new Promise((resolver) => {
    let respuesta = false;
    const { cuerpo, pie, cerrar } = abrirDialogo({ titulo, tamano: 'estrecho', alCerrar: () => resolver(respuesta) });
    cuerpo.append(...[h('p', { text: mensaje }), detalle ? h('p', { class: 'texto-suave texto-pequeno', text: detalle }) : null].filter(Boolean));
    const si = h('button', { type: 'button', class: `boton ${peligro ? 'boton-peligro' : 'boton-primario'}`, text: aceptar, onClick: () => { respuesta = true; cerrar(); } });
    pie.append(h('button', { type: 'button', class: 'boton boton-secundario', text: 'Cancelar', onClick: () => cerrar() }), si);
    requestAnimationFrame(() => pie.querySelector('.boton-secundario').focus());
  });
}

// ─── Campos de formulario ──────────────────────────────────────────────
/**
 * Crea un campo con etiqueta, ayuda y espacio para el error, todos asociados.
 * tipo: texto | correo | contrasena | numero | area | seleccion | casilla | archivo | busqueda
 */
export function campo({ nombre, etiqueta, tipo = 'texto', valor = '', ayuda, requerido = false, opciones = [], max, min, paso, filas, autocompletar, marcador, aceptar, desactivado, entrada }) {
  const id = idUnico(`campo-${nombre}`);
  const idAyuda = ayuda ? `${id}-ayuda` : null;
  const idError = `${id}-error`;
  const describe = [idAyuda, idError].filter(Boolean).join(' ');

  if (tipo === 'casilla') {
    const input = h('input', { type: 'checkbox', id, name: nombre, checked: Boolean(valor), 'aria-describedby': describe, disabled: desactivado });
    return h('div', { class: 'campo-casilla', dataset: { campo: nombre } }, input,
      h('div', {}, h('label', { for: id, text: etiqueta }), idAyuda ? h('span', { id: idAyuda, class: 'ayuda texto-pequeno texto-suave', text: ` ${ayuda}` }) : null,
        h('span', { id: idError, class: 'error-campo' })));
  }

  const tipos = { texto: 'text', correo: 'email', contrasena: 'password', numero: 'text', busqueda: 'search', archivo: 'file', telefono: 'tel', enlace: 'url' };
  let control;
  const comunes = { id, name: nombre, 'aria-describedby': describe, required: requerido, 'aria-required': requerido ? 'true' : null, disabled: desactivado };
  if (tipo === 'area') {
    control = h('textarea', { ...comunes, rows: filas ?? 4, maxlength: max });
    control.value = valor ?? '';
  } else if (tipo === 'seleccion') {
    control = h('select', comunes, opciones.map((o) => h('option', { value: o.valor, text: o.texto, selected: String(o.valor) === String(valor ?? '') })));
  } else {
    control = h('input', {
      ...comunes, type: tipos[tipo] ?? 'text', maxlength: tipo === 'numero' ? null : max, autocomplete: autocompletar, placeholder: marcador, accept: aceptar,
      inputmode: tipo === 'numero' ? (paso === 'entero' ? 'numeric' : 'decimal') : (entrada ?? null),
    });
    if (tipo !== 'archivo') control.value = valor ?? '';
  }
  const etiquetaEl = h('label', { for: id }, etiqueta, requerido ? h('span', { class: 'obligatorio', 'aria-hidden': 'true', text: ' *' }) : null);
  if (max && (tipo === 'area' || tipo === 'texto')) {
    const cuenta = h('span', { class: 'contador', 'aria-hidden': 'true' });
    const actualizar = () => { cuenta.textContent = `${control.value.length}/${max}`; };
    control.addEventListener('input', actualizar);
    actualizar();
    etiquetaEl.append(cuenta);
  }
  return h('div', { class: 'campo', dataset: { campo: nombre } }, etiquetaEl, control,
    idAyuda ? h('span', { id: idAyuda, class: 'ayuda', text: ayuda }) : null,
    h('span', { id: idError, class: 'error-campo' }));
}

/** Lee los valores de los campos de un formulario (casillas como booleano). */
export function leerFormulario(form) {
  const datos = {};
  for (const el of form.elements) {
    if (!el.name || el.type === 'file' || el.dataset.ignorar === 'si') continue;
    if (el.type === 'checkbox') datos[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) datos[el.name] = el.value; }
    else datos[el.name] = el.value;
  }
  return datos;
}

/** Limpia los errores mostrados en un formulario. */
export function limpiarErrores(form) {
  form.querySelector('.resumen-errores')?.remove();
  for (const el of form.querySelectorAll('[aria-invalid="true"]')) el.removeAttribute('aria-invalid');
  for (const el of form.querySelectorAll('.error-campo')) el.textContent = '';
}

/**
 * Muestra el error de la API: mensaje general + errores por campo, con un
 * resumen enlazado al inicio del formulario que recibe el foco.
 */
export function mostrarErrores(form, error) {
  limpiarErrores(form);
  const detalles = error?.detalles ?? {};
  const items = [];
  for (const [nombre, mensaje] of Object.entries(detalles)) {
    const base = nombre.split('.')[0];
    const contenedor = form.querySelector(`[data-campo="${CSS.escape(nombre)}"]`) ?? form.querySelector(`[data-campo="${CSS.escape(base)}"]`);
    const control = contenedor?.querySelector('input:not([type="hidden"]), select, textarea, button');
    const espacio = contenedor && [...contenedor.querySelectorAll('.error-campo')].find((el) => el.closest('[data-campo]') === contenedor);
    if (contenedor && control && espacio) {
      espacio.textContent = mensaje;
      control.setAttribute('aria-invalid', 'true');
      items.push(h('li', {}, h('a', { href: `#${control.id}`, text: mensaje, onClick: (e) => { e.preventDefault(); control.focus(); } })));
    } else {
      items.push(h('li', { text: mensaje }));
    }
  }
  const resumen = h('div', { class: 'resumen-errores', tabindex: '-1', role: 'alert' },
    h('h3', { text: error?.message ?? 'Revisa los campos marcados.' }), items.length ? h('ul', {}, items) : null);
  form.prepend(resumen);
  resumen.focus();
}

/** Ejecuta una acción mostrando el botón ocupado y sus errores. */
export async function conBotonOcupado(boton, accion, textoOcupado = 'Guardando…') {
  const original = boton.textContent;
  boton.disabled = true;
  boton.setAttribute('aria-busy', 'true');
  boton.textContent = textoOcupado;
  try { return await accion(); } finally {
    boton.disabled = false;
    boton.removeAttribute('aria-busy');
    boton.textContent = original;
  }
}

/** Icono decorativo (oculto para lectores de pantalla). */
export function icono(nombre) {
  const rutas = {
    asa: 'M7 4h2v2H7zm0 7h2v2H7zm0 7h2v2H7zm8-14h2v2h-2zm0 7h2v2h-2zm0 7h2v2h-2z',
    arriba: 'M12 5l-7 7h4v7h6v-7h4z',
    abajo: 'M12 19l7-7h-4V5H9v7H5z',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', rutas[nombre] ?? '');
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

/** Tabla accesible: columnas [{titulo, valor(fila) → nodo|texto, clase}] */
export function tabla({ titulo, columnas, filas, vacio = 'No hay registros.' }) {
  if (!filas.length) return h('p', { class: 'vacio', text: vacio });
  return h('div', { class: 'tabla-envoltura', role: 'region', 'aria-label': titulo, tabindex: '0' },
    h('table', { class: 'tabla' },
      h('caption', { class: 'visualmente-oculto', text: titulo }),
      h('thead', {}, h('tr', {}, columnas.map((c) => h('th', { scope: 'col', class: c.clase, text: c.titulo })))),
      h('tbody', {}, filas.map((f) => h('tr', {}, columnas.map((c, i) => {
        const valor = c.valor(f);
        return i === 0 && c.encabezado !== false ? h('th', { scope: 'row', class: c.clase }, valor) : h('td', { class: c.clase }, valor);
      }))))));
}

/** Controles de paginación. */
export function paginacion({ total, pagina, porPagina, alCambiar }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  return h('nav', { class: 'paginacion', 'aria-label': 'Paginación' },
    h('span', { class: 'texto-suave texto-pequeno', text: `${total} resultado${total === 1 ? '' : 's'} · página ${pagina} de ${paginas}` }),
    h('div', { class: 'grupo-botones' },
      h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Anterior', disabled: pagina <= 1, onClick: () => alCambiar(pagina - 1) }),
      h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Siguiente', disabled: pagina >= paginas, onClick: () => alCambiar(pagina + 1) })));
}

/** Pestañas accesibles (patrón ARIA con flechas). */
export function pestanas({ etiqueta, opciones, alElegir, inicial = 0 }) {
  const lista = h('div', { class: 'pestanas', role: 'tablist', 'aria-label': etiqueta });
  const panel = h('div', { role: 'tabpanel', tabindex: '0' });
  const botones = opciones.map((o, i) => h('button', {
    type: 'button', role: 'tab', id: idUnico('pestana'), 'aria-selected': 'false', tabindex: '-1', text: o.texto,
    onClick: () => elegir(i, true),
    onKeydown: (e) => {
      const n = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (n) { e.preventDefault(); elegir((i + n + opciones.length) % opciones.length, true); }
      if (e.key === 'Home') { e.preventDefault(); elegir(0, true); }
      if (e.key === 'End') { e.preventDefault(); elegir(opciones.length - 1, true); }
    },
  }));
  lista.append(...botones);
  function elegir(i, foco) {
    botones.forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; });
    panel.setAttribute('aria-labelledby', botones[i].id);
    if (foco) botones[i].focus();
    vaciar(panel);
    alElegir(opciones[i], panel, i);
  }
  queueMicrotask(() => elegir(inicial, false));
  return h('div', {}, lista, panel);
}
