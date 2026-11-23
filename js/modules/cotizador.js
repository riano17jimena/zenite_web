/**
 * Cotizador modular de 3 pestañas (RF-16 a RF-21):
 *   1. Análisis y consultoría · 2. Construcción · 3. Financiera y costos.
 * Las opciones y los precios vienen de la base de datos a través de la API.
 * El visitante solo ve lo necesario: nombres, unidades y el valor de lo que
 * eligió; el cálculo se hace en el servidor. Puede cotizar una sola pestaña.
 * Al final envía sus datos y Zenite recibe el documento de cotización en Word.
 * @module cotizador
 */
import { llamarApi } from './api.js';
import { crear } from './utilidades.js';

const UNIDAD_CANTIDAD = { MES: 'meses', UNIDAD: 'unidades', HORA: 'horas' };
const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

export const formatearCOP = (valor) => cop.format(Math.round(Number(valor) || 0));

/** Convierte un texto con coma o punto decimal en número (o NaN). */
export function leerNumero(texto) {
  const limpio = String(texto ?? '').trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  return limpio === '' ? NaN : Number(limpio);
}

/** Crea el estado vacío de una cotización. */
export function crearEstado() {
  return { tipoProyecto: '', area: '', consultoria: new Map(), financiera: new Map(), construccion: new Map() };
}

export const totalElegidos = (e) => e.consultoria.size + e.construccion.size + e.financiera.size;

/**
 * Revisa la selección antes de calcular. Devuelve una lista de errores
 * { campo, mensaje } (campo: 'general', 'area' o 'obra:<código>' / 'servicio:<id>').
 * @param {object} estado
 * @param {Map<number, object>} servicios  catálogo por id (para saber la unidad)
 */
export function validarSeleccion(estado, servicios) {
  const errores = [];
  if (totalElegidos(estado) === 0) errores.push({ campo: 'general', mensaje: 'Elige al menos un servicio o una actividad en cualquiera de las tres pestañas.' });
  const area = leerNumero(estado.area);
  const necesitaArea = [...estado.consultoria.keys(), ...estado.financiera.keys()].some((id) => servicios.get(id)?.unidad === 'M2');
  if (estado.area !== '' && !(area > 0 && area <= 1_000_000)) errores.push({ campo: 'area', mensaje: 'Escribe el área como un número mayor que cero, por ejemplo 120.' });
  else if (necesitaArea && !(area > 0)) errores.push({ campo: 'area', mensaje: 'Escribe el área aproximada: algunos servicios elegidos se cobran por m².' });
  for (const [id, item] of [...estado.consultoria, ...estado.financiera]) {
    if (UNIDAD_CANTIDAD[servicios.get(id)?.unidad] && !(leerNumero(item.cantidad) > 0)) {
      errores.push({ campo: `servicio:${id}`, mensaje: `Escribe la cantidad de ${UNIDAD_CANTIDAD[servicios.get(id).unidad]} para «${servicios.get(id).nombre}».` });
    }
  }
  for (const [codigo, item] of estado.construccion) {
    if (!(leerNumero(item.cantidad) > 0)) errores.push({ campo: `obra:${codigo}`, mensaje: `Escribe la cantidad (${item.unidad}) para «${item.descripcion}».` });
  }
  return errores;
}

/** Arma el cuerpo que espera la API (/api/publico/cotizador/calcular). */
export function construirSeleccion(estado, servicios) {
  const servicio = ([id, item]) => ({ id, ...(UNIDAD_CANTIDAD[servicios.get(id)?.unidad] ? { cantidad: leerNumero(item.cantidad) } : {}) });
  const area = leerNumero(estado.area);
  return {
    tipoProyecto: estado.tipoProyecto || null,
    ...(area > 0 ? { areaM2: area } : {}),
    consultoria: [...estado.consultoria].map(servicio),
    construccion: [...estado.construccion].map(([codigo, item]) => ({ codigo, cantidad: leerNumero(item.cantidad) })),
    financiera: [...estado.financiera].map(servicio),
  };
}

// ─── Interfaz ──────────────────────────────────────────────────────────
export function iniciarCotizador() {
  const modalEl = document.getElementById('modal-cotizador');
  if (!modalEl || !window.bootstrap?.Modal) return;
  const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
  const $ = (id) => document.getElementById(id);
  const vistas = { elegir: $('cotizador-elegir'), resultado: $('cotizador-resultado'), enviado: $('cotizador-enviado') };
  const botones = { calcular: $('cot-calcular'), volver: $('cot-volver'), enviar: $('cot-enviar'), nueva: $('cot-nueva'), cerrar: $('cot-cerrar') };
  const estadoEl = $('cotizador-estado');
  const seleccionEl = $('cotizador-seleccion');
  let estado = crearEstado();
  let opciones = null;
  let servicios = new Map();
  let ultimoCalculo = null;
  let cargando = null;

  for (const disparador of document.querySelectorAll('[data-abrir-cotizador]')) {
    disparador.addEventListener('click', () => modal.show());
  }
  modalEl.addEventListener('shown.bs.modal', () => { preparar(); });

  // Enlaces de las páginas de servicios: index.html?tipo=residencial#simulador
  const tipoInicial = new URLSearchParams(location.search).get('tipo');
  if (tipoInicial) {
    estado.tipoProyecto = tipoInicial;
    window.addEventListener('load', () => setTimeout(() => modal.show(), 400), { once: true });
  }

  function mostrarVista(nombre) {
    for (const [clave, el] of Object.entries(vistas)) el.hidden = clave !== nombre;
    botones.calcular.hidden = nombre !== 'elegir';
    botones.volver.hidden = nombre !== 'resultado';
    botones.enviar.hidden = nombre !== 'resultado';
    botones.nueva.hidden = nombre !== 'enviado';
    botones.cerrar.hidden = nombre !== 'enviado';
    seleccionEl.hidden = nombre !== 'elegir';
    $('cotizador-paso').textContent = { elegir: 'Paso 1 de 2 · Elige lo que necesitas', resultado: 'Paso 2 de 2 · Revisa y envía', enviado: 'Solicitud enviada' }[nombre];
    modalEl.querySelector('.modal-body').scrollTop = 0;
  }

  function aviso(texto, tipo = 'info') {
    estadoEl.replaceChildren(texto ? crear('p', { clase: `cotizador__aviso cotizador__aviso--${tipo}`, texto }) : '');
  }

  async function preparar() {
    if (opciones) return;
    if (cargando) return cargando;
    aviso('Cargando el cotizador…');
    const lento = setTimeout(() => aviso('Estamos conectando con el servidor. La primera vez puede tardar hasta un minuto…'), 5000);
    cargando = llamarApi('/api/publico/cotizador/opciones', { tiempo: 70000 })
      .then((datos) => {
        opciones = datos;
        servicios = new Map([...datos.consultoria, ...datos.financiera].map((s) => [s.id, s]));
        pintarOpciones();
        aviso('');
        mostrarVista('elegir');
        modalEl.querySelector('#cot-tipo').focus();
      })
      .catch((error) => {
        aviso(`${error.message} Mientras tanto, puedes escribirnos por WhatsApp al 315 711 0946.`, 'error');
        cargando = null;
      })
      .finally(() => clearTimeout(lento));
    return cargando;
  }

  // ── Paso 1: opciones ──
  function pintarOpciones() {
    const tipo = $('cot-tipo');
    tipo.append(...opciones.tiposProyecto.map((t) => crear('option', { value: t.clave, texto: t.nombre })));
    tipo.value = estado.tipoProyecto;
    if (tipo.value !== estado.tipoProyecto) estado.tipoProyecto = '';
    tipo.addEventListener('change', () => { estado.tipoProyecto = tipo.value; });
    const area = $('cot-area');
    area.addEventListener('input', () => { estado.area = area.value; limpiarError(area, $('cot-area-error')); });

    pintarServicios($('lista-consultoria'), opciones.consultoria, 'consultoria');
    pintarServicios($('lista-financiera'), opciones.financiera, 'financiera');

    const capitulo = $('obra-capitulo');
    capitulo.append(...opciones.capitulos.map((c) => crear('option', { value: c.codigo, texto: `${c.codigo}. ${c.nombre}` })));
    capitulo.addEventListener('change', () => { if (capitulo.value) buscarObra(); });
    $('form-buscar-obra').addEventListener('submit', (e) => { e.preventDefault(); buscarObra(); });
    pintarElegidas();
    actualizarResumen();
  }

  function pintarServicios(contenedor, lista, pestana) {
    if (!lista.length) {
      contenedor.replaceChildren(crear('p', { clase: 'cotizador__ayuda', texto: 'Por ahora no hay servicios en esta pestaña.' }));
      return;
    }
    contenedor.replaceChildren(...lista.map((s) => {
      const id = `servicio-${s.id}`;
      const casilla = crear('input', { class: 'form-check-input', type: 'checkbox', id, value: s.id, 'aria-describedby': `${id}-desc` });
      casilla.className = 'form-check-input';
      const etiquetaCantidad = UNIDAD_CANTIDAD[s.unidad];
      const cantidad = etiquetaCantidad ? crear('input', { class: 'form-control', type: 'text', inputmode: 'decimal', id: `${id}-cantidad`, value: '1', 'aria-describedby': `${id}-error` }) : null;
      if (cantidad) cantidad.className = 'form-control form-control-sm';
      const zonaCantidad = cantidad ? crear('div', { clase: 'servicio-opcion__cantidad', hidden: true }, [
        crear('label', { clase: 'form-label', for: cantidad.id, texto: `Cantidad de ${etiquetaCantidad}` }), cantidad,
      ]) : null;
      const error = crear('p', { clase: 'invalid-feedback d-block', id: `${id}-error`, hidden: true });
      casilla.addEventListener('change', () => {
        if (casilla.checked) estado[pestana].set(s.id, { cantidad: cantidad?.value ?? 1 });
        else estado[pestana].delete(s.id);
        if (zonaCantidad) zonaCantidad.hidden = !casilla.checked;
        contenedor.querySelector(`[data-servicio="${s.id}"]`).classList.toggle('esta-elegido', casilla.checked);
        error.hidden = true;
        actualizarResumen();
      });
      cantidad?.addEventListener('input', () => { if (estado[pestana].has(s.id)) estado[pestana].get(s.id).cantidad = cantidad.value; error.hidden = true; cantidad.classList.remove('is-invalid'); });
      return crear('div', { clase: 'servicio-opcion', 'data-servicio': s.id }, [
        crear('div', { clase: 'form-check' }, [
          casilla,
          crear('label', { clase: 'form-check-label', for: id }, [crear('strong', { texto: s.nombre }), crear('span', { clase: 'servicio-opcion__unidad', texto: ` · ${s.unidad === 'M2' ? 'por m²' : s.unidad === 'GLOBAL' ? 'valor global' : `por ${s.unidadTexto.toLowerCase()}`}` })]),
          crear('p', { clase: 'servicio-opcion__desc', id: `${id}-desc`, texto: s.descripcion }),
        ]),
        zonaCantidad, error,
      ]);
    }));
  }

  async function buscarObra() {
    const capitulo = $('obra-capitulo').value;
    const termino = $('obra-buscar').value.trim();
    const resultados = $('resultados-obra');
    if (!capitulo && termino.length < 3) {
      resultados.replaceChildren(crear('p', { clase: 'cotizador__aviso cotizador__aviso--error', texto: 'Elige un capítulo o escribe al menos 3 letras para buscar.' }));
      $('obra-buscar').focus();
      return;
    }
    resultados.replaceChildren(crear('p', { clase: 'cotizador__ayuda', texto: 'Buscando…' }));
    try {
      const q = new URLSearchParams();
      if (capitulo) q.set('capitulo', capitulo);
      if (termino) q.set('buscar', termino);
      const r = await llamarApi(`/api/publico/cotizador/actividades?${q}`);
      if (!r.actividades.length) {
        resultados.replaceChildren(crear('p', { clase: 'cotizador__ayuda', texto: 'No encontramos actividades. Prueba con otra palabra o elige otro capítulo.' }));
        return;
      }
      resultados.replaceChildren(
        crear('p', { clase: 'cotizador__ayuda', texto: `${r.actividades.length} resultado${r.actividades.length === 1 ? '' : 's'}${r.hayMas ? ' (hay más: escribe una palabra más específica)' : ''}.` }),
        crear('ul', { clase: 'lista-obra', role: 'list' }, r.actividades.map((a) => {
          const elegida = estado.construccion.has(a.codigo);
          const boton = crear('button', { type: 'button', clase: 'btn btn-contorno btn-sm', 'aria-label': `${elegida ? 'Ya agregada' : 'Agregar'}: ${a.descripcion}`, texto: elegida ? 'Agregada' : 'Agregar' });
          boton.disabled = elegida;
          boton.addEventListener('click', () => {
            estado.construccion.set(a.codigo, { ...a, cantidad: '' });
            boton.disabled = true;
            boton.textContent = 'Agregada';
            boton.setAttribute('aria-label', `Ya agregada: ${a.descripcion}`);
            pintarElegidas();
            actualizarResumen(`Agregaste «${a.descripcion}». Escribe la cantidad en la lista de actividades elegidas.`);
            $(`obra-cantidad-${a.codigo.replace(/\./g, '-')}`)?.focus();
          });
          return crear('li', { clase: 'lista-obra__item' }, [
            crear('div', {}, [crear('span', { clase: 'lista-obra__desc', texto: a.descripcion }), crear('span', { clase: 'lista-obra__meta', texto: `${a.subcapitulo ? `${a.subcapitulo} · ` : ''}Unidad: ${a.unidad}` })]),
            boton,
          ]);
        })),
      );
    } catch (error) {
      resultados.replaceChildren(crear('p', { clase: 'cotizador__aviso cotizador__aviso--error', texto: error.message }));
    }
  }

  function pintarElegidas() {
    const zona = $('elegidas-obra');
    if (!estado.construccion.size) {
      zona.replaceChildren(crear('p', { clase: 'cotizador__ayuda', texto: 'Todavía no agregas actividades de construcción.' }));
      return;
    }
    zona.replaceChildren(crear('ul', { clase: 'lista-obra lista-obra--elegidas', role: 'list', 'aria-labelledby': 'elegidas-titulo' }, [...estado.construccion.values()].map((a) => {
      const id = `obra-cantidad-${a.codigo.replace(/\./g, '-')}`;
      const cantidad = crear('input', { type: 'text', inputmode: 'decimal', id, value: a.cantidad, autocomplete: 'off', 'aria-describedby': `${id}-error` });
      cantidad.className = 'form-control';
      cantidad.addEventListener('input', () => { a.cantidad = cantidad.value; cantidad.classList.remove('is-invalid'); $(`${id}-error`).hidden = true; });
      const quitar = crear('button', { type: 'button', clase: 'btn btn-enlace btn-sm', 'aria-label': `Quitar: ${a.descripcion}`, texto: 'Quitar' });
      quitar.addEventListener('click', () => {
        estado.construccion.delete(a.codigo);
        pintarElegidas();
        actualizarResumen(`Quitaste «${a.descripcion}».`);
        const boton = [...$('resultados-obra').querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.endsWith(a.descripcion));
        if (boton) { boton.disabled = false; boton.textContent = 'Agregar'; boton.setAttribute('aria-label', `Agregar: ${a.descripcion}`); }
        $('elegidas-titulo').focus?.();
      });
      return crear('li', { clase: 'lista-obra__item', 'data-obra': a.codigo }, [
        crear('div', {}, [crear('span', { clase: 'lista-obra__desc', texto: a.descripcion }), crear('span', { clase: 'lista-obra__meta', texto: `Ítem ${a.codigo}` })]),
        crear('div', { clase: 'lista-obra__cantidad' }, [
          crear('label', { clase: 'form-label', for: id }, ['Cantidad ', crear('span', { clase: 'visually-hidden', texto: `de ${a.descripcion} ` }), `(${a.unidad})`]),
          cantidad,
          crear('p', { clase: 'invalid-feedback d-block', id: `${id}-error`, hidden: true }),
        ]),
        quitar,
      ]);
    })));
  }

  function actualizarResumen(anuncio) {
    for (const pestana of ['consultoria', 'construccion', 'financiera']) {
      const n = estado[pestana].size;
      const el = modalEl.querySelector(`[data-contador-pestana="${pestana}"]`);
      el.textContent = n ? `(${n})` : '';
      el.setAttribute('aria-label', n ? `${n} elegido${n === 1 ? '' : 's'}` : '');
    }
    const total = totalElegidos(estado);
    seleccionEl.textContent = anuncio ?? (total ? `${total} elemento${total === 1 ? '' : 's'} elegido${total === 1 ? '' : 's'}.` : 'Aún no has elegido nada.');
  }

  function limpiarError(campo, error) {
    campo?.classList.remove('is-invalid');
    campo?.removeAttribute('aria-invalid');
    if (error) error.hidden = true;
  }

  function marcarError(campo, error, mensaje) {
    campo?.classList.add('is-invalid');
    campo?.setAttribute('aria-invalid', 'true');
    if (error) { error.textContent = mensaje; error.hidden = false; }
  }

  function mostrarErroresSeleccion(errores) {
    let primero = null;
    for (const e of errores) {
      let campo = null; let error = null; let pestana = null;
      if (e.campo === 'area') { campo = $('cot-area'); error = $('cot-area-error'); }
      if (e.campo.startsWith('obra:')) { const id = `obra-cantidad-${e.campo.slice(5).replace(/\./g, '-')}`; campo = $(id); error = $(`${id}-error`); pestana = 'tab-construccion'; }
      if (e.campo.startsWith('servicio:')) {
        const id = Number(e.campo.slice(9)); const base = `servicio-${id}`; campo = $(`${base}-cantidad`); error = $(`${base}-error`);
        pestana = estado.consultoria.has(id) ? 'tab-consultoria' : 'tab-financiera';
      }
      marcarError(campo, error, e.mensaje);
      if (!primero) primero = { campo, pestana };
    }
    aviso(errores.length === 1 ? errores[0].mensaje : `Revisa ${errores.length} datos antes de calcular: ${errores.map((e) => e.mensaje).join(' ')}`, 'error');
    if (primero?.pestana) window.bootstrap.Tab.getOrCreateInstance($(primero.pestana)).show();
    setTimeout(() => (primero?.campo ?? estadoEl.querySelector('p'))?.focus?.(), 200);
    if (!primero?.campo) estadoEl.querySelector('p')?.setAttribute('tabindex', '-1');
  }

  botones.calcular.addEventListener('click', async () => {
    if (!opciones) return;
    const errores = validarSeleccion(estado, servicios);
    if (errores.length) { mostrarErroresSeleccion(errores); return; }
    aviso('Calculando tu cotización…');
    botones.calcular.disabled = true;
    try {
      ultimoCalculo = await llamarApi('/api/publico/cotizador/calcular', { metodo: 'POST', cuerpo: { seleccion: construirSeleccion(estado, servicios) } });
      aviso('');
      pintarResultado(ultimoCalculo);
      mostrarVista('resultado');
      $('resultado-titulo').focus();
    } catch (error) {
      aviso(error.message, 'error');
    } finally {
      botones.calcular.disabled = false;
    }
  });

  botones.volver.addEventListener('click', () => { mostrarVista('elegir'); aviso(''); botones.calcular.focus(); });

  function tablaSeccion(titulo, seccion, construccion = false) {
    if (!seccion.lineas.length) return null;
    const filas = seccion.lineas.map((l) => crear('tr', {}, [
      crear('th', { scope: 'row' }, [l.descripcion, construccion && l.referencia ? crear('span', { clase: 'resultado__ref', texto: ` · Ítem ${l.referencia}` }) : null]),
      crear('td', { clase: 'numero', texto: `${numero.format(l.cantidad)} ${l.unidad}` }),
      crear('td', { clase: 'numero', texto: formatearCOP(l.precioUnitario) }),
      crear('td', { clase: 'numero', texto: formatearCOP(l.valor) }),
    ]));
    const pie = [crear('tr', { clase: 'resultado__subtotal' }, [crear('th', { scope: 'row', colspan: '3', texto: construccion ? 'Costo directo' : 'Subtotal' }), crear('td', { clase: 'numero', texto: formatearCOP(seccion.subtotal) })])];
    if (construccion) {
      const p = seccion.porcentajes;
      const pct = (x) => `${numero.format(x * 100)} %`;
      pie.push(
        ...[[`Administración (${pct(p.administracion)})`, seccion.aiu.administracion], [`Imprevistos (${pct(p.imprevistos)})`, seccion.aiu.imprevistos], [`Utilidad (${pct(p.utilidad)})`, seccion.aiu.utilidad], [`IVA sobre la utilidad (${pct(p.ivaSobreUtilidad)})`, seccion.aiu.ivaUtilidad]]
          .map(([t, v]) => crear('tr', {}, [crear('th', { scope: 'row', colspan: '3', texto: t }), crear('td', { clase: 'numero', texto: formatearCOP(v) })])),
        crear('tr', { clase: 'resultado__subtotal' }, [crear('th', { scope: 'row', colspan: '3', texto: 'Total construcción' }), crear('td', { clase: 'numero', texto: formatearCOP(seccion.total) })]),
      );
    }
    return crear('section', { clase: 'resultado__seccion', 'aria-label': titulo }, [
      crear('h4', { clase: 'resultado__titulo', texto: titulo }),
      crear('div', { clase: 'table-responsive' }, [crear('table', { clase: 'table resultado__tabla' }, [
        crear('caption', { clase: 'visually-hidden', texto: `Detalle de ${titulo}` }),
        crear('thead', {}, [crear('tr', {}, ['Concepto', 'Cantidad', 'Valor unitario', 'Valor'].map((t, i) => crear('th', { scope: 'col', clase: i ? 'numero' : null, texto: t })))]),
        crear('tbody', {}, filas),
        crear('tfoot', {}, pie),
      ])]),
    ]);
  }

  function pintarResultado(r) {
    const s = r.secciones;
    $('resultado-cotizacion').replaceChildren(...[
      tablaSeccion('1. Análisis y consultoría', s.CONSULTORIA),
      tablaSeccion('2. Construcción', s.CONSTRUCCION, true),
      tablaSeccion('3. Financiera y costos', s.FINANCIERA),
      crear('p', { clase: 'resultado__total' }, [crear('span', { texto: 'Valor total referencial' }), crear('strong', { texto: formatearCOP(r.total) })]),
      crear('p', { clase: 'resultado__aviso', texto: `${r.avisoReferencial} Validez: ${r.validezDias} días.` }),
    ].filter(Boolean));
  }

  // ── Paso 2: datos de contacto ──
  const form = $('form-cotizacion');
  const telefono = form.elements.namedItem('telefono');
  telefono.addEventListener('input', () => {
    const d = telefono.value.replace(/\D/g, '').length;
    telefono.setCustomValidity(telefono.value === '' || (d >= 7 && d <= 15) ? '' : 'Número inválido');
  });
  form.addEventListener('input', (e) => { if (e.target.classList.contains('is-invalid') && e.target.checkValidity()) limpiarError(e.target); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    telefono.dispatchEvent(new Event('input'));
    const campos = [...form.elements].filter((c) => c.willValidate && c.name && c.name !== 'sitioWeb');
    const invalidos = campos.filter((c) => !c.checkValidity());
    campos.forEach((c) => (invalidos.includes(c) ? marcarError(c) : limpiarError(c)));
    if (invalidos.length) {
      aviso(`Revisa ${invalidos.length === 1 ? 'el campo marcado' : `los ${invalidos.length} campos marcados`} antes de enviar.`, 'error');
      invalidos[0].focus();
      return;
    }
    const datos = Object.fromEntries(['nombre', 'correo', 'telefono', 'ciudad', 'mensaje', 'sitioWeb'].map((n) => [n, form.elements.namedItem(n).value.trim()]));
    botones.enviar.disabled = true;
    botones.enviar.textContent = 'Enviando…';
    aviso('Enviando tu solicitud…');
    try {
      const r = await llamarApi('/api/publico/cotizaciones', { metodo: 'POST', tiempo: 45000, cuerpo: { ...datos, consentimiento: true, seleccion: construirSeleccion(estado, servicios) } });
      aviso('');
      $('enviado-texto').replaceChildren(
        r.codigo ? crear('p', { clase: 'enviado__codigo' }, ['Número de cotización: ', crear('strong', { texto: r.codigo })]) : '',
        crear('p', { texto: `Gracias, ${datos.nombre.split(' ')[0]}. Nuestro equipo recibió tu cotización referencial por ${formatearCOP(ultimoCalculo?.total ?? r.total)} y te contactará a ${datos.correo} o al ${datos.telefono} en máximo un día hábil con la propuesta formal.` }),
        crear('p', { clase: 'resultado__aviso', texto: 'Si tienes prisa, escríbenos por WhatsApp al 315 711 0946 mencionando tu número de cotización.' }),
      );
      mostrarVista('enviado');
      $('enviado-titulo').focus();
    } catch (error) {
      if (error.detalles) {
        for (const [campo, mensaje] of Object.entries(error.detalles)) {
          const el = form.elements.namedItem(campo);
          if (el) marcarError(el, $(`${el.id}-error`), mensaje);
        }
      }
      aviso(error.message, 'error');
    } finally {
      botones.enviar.disabled = false;
      botones.enviar.textContent = 'Enviar solicitud';
    }
  });

  botones.nueva.addEventListener('click', () => {
    estado = crearEstado();
    form.reset();
    for (const c of modalEl.querySelectorAll('#cotizador-elegir input[type="checkbox"]')) { c.checked = false; c.dispatchEvent(new Event('change')); }
    $('cot-area').value = '';
    $('cot-tipo').value = '';
    $('resultados-obra').replaceChildren();
    pintarElegidas();
    actualizarResumen();
    mostrarVista('elegir');
    window.bootstrap.Tab.getOrCreateInstance($('tab-consultoria')).show();
    $('cot-tipo').focus();
  });
}
