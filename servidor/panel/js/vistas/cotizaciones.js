/** Cotizaciones generadas desde el simulador: detalle editable, documento Word y reenvío. */
import { descargar, enviar, obtener, reemplazar } from '../api.js';
import { abrirDialogo, anunciar, anunciarError, campo, conBotonOcupado, confirmar, formatoCOP, formatoFecha, formatoNumero, h, leerFormulario, paginacion, tabla } from '../ui.js';
import { encabezado } from './comun.js';

const SECCIONES = { CONSULTORIA: 'Análisis y consultoría', CONSTRUCCION: 'Construcción', FINANCIERA: 'Financiera y costos' };

export async function mostrar(contenedor, ctx) {
  const estado = { buscar: '', pagina: 1 };
  const resultados = h('div', { 'aria-live': 'polite' });
  const filtros = h('form', { class: 'barra-filtros', role: 'search', 'aria-label': 'Buscar cotizaciones' },
    campo({ nombre: 'buscar', etiqueta: 'Buscar por código o cliente', tipo: 'busqueda' }), h('button', { type: 'submit', class: 'boton boton-oscuro', text: 'Buscar' }));
  filtros.addEventListener('submit', (e) => { e.preventDefault(); Object.assign(estado, leerFormulario(filtros), { pagina: 1 }); cargar().catch(anunciarError); });
  contenedor.append(encabezado(ctx.titulo, 'Cada cotización del simulador se guarda aquí y se envía en Word al correo configurado. Revísala y ajústala antes de enviarla al cliente.'), filtros, resultados);

  async function cargar() {
    const q = new URLSearchParams({ pagina: estado.pagina });
    if (estado.buscar) q.set('buscar', estado.buscar);
    const r = await obtener(`/api/admin/cotizaciones?${q}`);
    resultados.replaceChildren(tabla({
      titulo: 'Cotizaciones', vacio: 'Todavía no hay cotizaciones.', filas: r.cotizaciones,
      columnas: [
        { titulo: 'Código', valor: (c) => c.codigo },
        { titulo: 'Fecha', valor: (c) => formatoFecha(c.creada) },
        { titulo: 'Cliente', valor: (c) => c.nombreCliente },
        { titulo: 'Total referencial', clase: 'numero', valor: (c) => formatoCOP(c.total) },
        { titulo: 'Correo', valor: (c) => (c.enviadaEn ? h('span', { class: 'insignia insignia-exito', text: 'Enviada' }) : h('span', { class: 'insignia insignia-error', text: c.errorEnvio ? 'Falló' : 'Pendiente' })) },
        {
          titulo: 'Acciones', clase: 'acciones', valor: (c) => [
            h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Ver', 'aria-label': `Ver cotización ${c.codigo}`, onClick: () => detalle(c.id, () => cargar().catch(() => {})) }),
            h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Word', 'aria-label': `Descargar Word de ${c.codigo}`, onClick: () => descargar(`/api/admin/cotizaciones/${c.id}/documento`, `${c.codigo}.docx`).then((n) => anunciar(`Descargado ${n}.`)).catch(anunciarError) }),
            h('button', {
              type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Reenviar', 'aria-label': `Reenviar ${c.codigo} al correo`,
              onClick: async (e) => { try { await conBotonOcupado(e.currentTarget, () => enviar(`/api/admin/cotizaciones/${c.id}/reenviar`), 'Enviando…'); anunciar('Cotización reenviada.'); cargar().catch(() => {}); } catch (err) { anunciarError(err); } },
            }),
          ],
        },
      ],
    }), paginacion({ total: r.total, pagina: r.pagina, porPagina: r.porPagina, alCambiar: (p) => { estado.pagina = p; cargar().catch(anunciarError); } }));
  }
  await cargar();
}

async function detalle(id, alGuardar) {
  const c = await obtener(`/api/admin/cotizaciones/${id}`);
  const { cuerpo, pie, cerrar } = abrirDialogo({ titulo: `Cotización ${c.codigo}`, tamano: 'ancho' });
  pintarDetalle(c, { cuerpo, pie, cerrar }, id, alGuardar);
}

/** Pinta el detalle de la cotización con sus ítems editables (agregar, editar o quitar), como en el cotizador. */
function pintarDetalle(c, { cuerpo, pie, cerrar }, id, alGuardar) {
  cuerpo.replaceChildren();
  pie.replaceChildren();
  let lineas = c.lineas.map((l) => ({ ...l }));
  const zonas = {};

  cuerpo.append(
    h('p', { text: `${c.nombreCliente} · ${c.correoCliente} · ${c.telefonoCliente}${c.ciudad ? ` · ${c.ciudad}` : ''}${c.areaM2 ? ` · ${formatoNumero(c.areaM2)} m²` : ''}` }),
    c.errorEnvio ? h('p', { class: 'mensaje mensaje-error', text: `No se pudo enviar el correo: ${c.errorEnvio}` }) : '',
    h('p', { class: 'texto-suave texto-pequeno', text: '«Agregar ítem» busca en los servicios y actividades del cotizador: elige uno para traer su descripción, unidad y precio. Luego puedes ajustar la cantidad (y el precio si hace falta) y quitar lo que no aplique. Al guardar se recalculan Administración, Imprevistos, Utilidad, IVA y el total con los mismos porcentajes de esta cotización.' }),
  );

  for (const [clave, nombre] of Object.entries(SECCIONES)) {
    zonas[clave] = h('div');
    cuerpo.append(
      h('div', { class: 'encabezado-vista' }, h('h3', { text: nombre }),
        h('button', {
          type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Agregar ítem', 'aria-label': `Agregar ítem en ${nombre}`,
          onClick: async () => {
            const item = await elegirDelCatalogo(clave);
            if (!item) return;
            lineas.push({ seccion: clave, referencia: item.referencia, descripcion: item.descripcion, unidad: item.unidad, cantidad: 1, precioUnitario: item.precioUnitario });
            pintar();
          },
        })),
      zonas[clave],
    );
  }

  function pintar() {
    for (const [clave] of Object.entries(SECCIONES)) {
      const filas = lineas.filter((l) => l.seccion === clave);
      zonas[clave].replaceChildren(filas.length ? tablaLineasEditable(filas, lineas, pintar) : h('p', { class: 'vacio', text: 'Sin ítems en esta sección.' }));
    }
  }
  pintar();

  const filasResumen = [['Análisis y consultoría', c.subtotalConsultoria], ['Construcción (costo directo)', c.subtotalConstruccion], ['Administración', c.administracion], ['Imprevistos', c.imprevistos], ['Utilidad', c.utilidad], ['IVA sobre utilidad', c.ivaUtilidad], ['Financiera y costos', c.subtotalFinanciera], ['Total referencial', c.total]].filter(([, v]) => v);
  cuerpo.append(h('h3', { text: 'Resumen' }), h('p', { class: 'texto-suave texto-pequeno', text: 'El resumen muestra los últimos valores guardados. Guarda los cambios de ítems para actualizarlo.' }),
    tabla({ titulo: 'Resumen', filas: filasResumen, columnas: [{ titulo: 'Concepto', valor: (f) => f[0] }, { titulo: 'Valor', clase: 'numero', valor: (f) => formatoCOP(f[1]) }] }));

  const guardar = h('button', { type: 'button', class: 'boton boton-primario', text: 'Guardar cambios y recalcular' });
  guardar.addEventListener('click', async () => {
    try {
      const datos = { lineas: lineas.map((l) => ({ seccion: l.seccion, referencia: l.referencia, descripcion: l.descripcion, unidad: l.unidad, cantidad: l.cantidad, precioUnitario: l.precioUnitario })) };
      const actualizada = await conBotonOcupado(guardar, () => reemplazar(`/api/admin/cotizaciones/${id}/lineas`, datos), 'Guardando y recalculando…');
      anunciar('Cotización actualizada.');
      pintarDetalle(actualizada, { cuerpo, pie, cerrar }, id, alGuardar);
      alGuardar?.();
    } catch (error) { anunciarError(error); }
  });
  pie.append(
    h('button', { type: 'button', class: 'boton boton-secundario', text: 'Descargar Word', onClick: () => descargar(`/api/admin/cotizaciones/${id}/documento`, `${c.codigo}.docx`).catch(anunciarError) }),
    h('button', { type: 'button', class: 'boton boton-secundario', text: 'Cerrar', onClick: () => cerrar() }),
    guardar,
  );
}

/** Tabla editable de ítems de una sección: cada fila muta el objeto en `todas` (la lista completa de la cotización). */
function tablaLineasEditable(filas, todas, pintar) {
  return h('div', { class: 'tabla-envoltura' }, h('table', { class: 'tabla' },
    h('caption', { class: 'visualmente-oculto', text: 'Ítems de la sección' }),
    h('thead', {}, h('tr', {}, ['Ítem', 'Descripción', 'Unidad', 'Cantidad', 'Vr. unitario', 'Valor', 'Acciones'].map((t) => h('th', { scope: 'col', text: t })))),
    h('tbody', {}, filas.map((f) => {
      const i = todas.indexOf(f);
      const valor = h('span', { text: formatoCOP(Number(f.cantidad || 0) * Number(f.precioUnitario || 0)) });
      const actualizarValor = () => { valor.textContent = formatoCOP(Number(f.cantidad || 0) * Number(f.precioUnitario || 0)); };
      return h('tr', {},
        h('td', { class: 'campo' }, h('input', { type: 'text', value: f.referencia ?? '', size: 6, 'aria-label': `Código o referencia de la fila ${i + 1}`, onInput: (e) => { f.referencia = e.target.value; } })),
        h('td', { class: 'campo' }, h('input', { type: 'text', value: f.descripcion ?? '', size: 28, required: true, 'aria-label': `Descripción de la fila ${i + 1}`, onInput: (e) => { f.descripcion = e.target.value; } })),
        h('td', { class: 'campo' }, h('input', { type: 'text', value: f.unidad ?? '', size: 6, required: true, 'aria-label': `Unidad de la fila ${i + 1}`, onInput: (e) => { f.unidad = e.target.value; } })),
        h('td', { class: 'campo' }, h('input', { type: 'text', inputmode: 'decimal', value: String(f.cantidad ?? ''), size: 6, 'aria-label': `Cantidad de la fila ${i + 1}`, onInput: (e) => { f.cantidad = e.target.value; actualizarValor(); } })),
        h('td', { class: 'campo numero' }, h('input', { type: 'text', inputmode: 'decimal', value: String(f.precioUnitario ?? ''), size: 10, 'aria-label': `Valor unitario de la fila ${i + 1}`, onInput: (e) => { f.precioUnitario = e.target.value; actualizarValor(); } })),
        h('td', { class: 'numero' }, valor),
        h('td', { class: 'acciones' }, h('button', {
          type: 'button', class: 'boton boton-peligro boton-pequeno', text: 'Quitar', 'aria-label': `Quitar fila ${i + 1}: ${f.descripcion}`,
          onClick: async () => {
            if (!(await confirmar({ titulo: 'Quitar ítem', mensaje: `¿Quitar «${f.descripcion || 'este ítem'}» de la cotización?`, detalle: 'Guarda los cambios para aplicarlo.', aceptar: 'Quitar', peligro: true }))) return;
            todas.splice(i, 1); pintar();
          },
        })));
    }))));
}

/**
 * Diálogo para elegir un ítem de la base de precios y servicios del cotizador (igual que al armar una cotización
 * desde el sitio): servicios de Análisis y consultoría o Financiera y costos, o actividades de Construcción.
 * Devuelve `{ referencia, descripcion, unidad, precioUnitario }` o `null` si se cancela.
 */
function elegirDelCatalogo(seccion) {
  return new Promise((resolver) => {
    let elegido = null;
    const elegir = (item) => { elegido = item; cerrar(); };
    const { cuerpo, pie, cerrar } = abrirDialogo({ titulo: `Elegir de «${SECCIONES[seccion]}»`, alCerrar: () => resolver(elegido) });
    const resultados = h('div', { 'aria-live': 'polite' });

    if (seccion === 'CONSTRUCCION') {
      const cargando = h('p', { class: 'texto-suave texto-pequeno', text: 'Cargando capítulos…' });
      cuerpo.append(cargando);
      obtener('/api/admin/cotizador/capitulos').then((caps) => {
        const form = h('form', { class: 'barra-filtros', role: 'search', 'aria-label': 'Buscar actividad' },
          campo({ nombre: 'capituloId', etiqueta: 'Capítulo', tipo: 'seleccion', opciones: [{ valor: '', texto: 'Todos' }, ...caps.map((c) => ({ valor: c.id, texto: `${c.codigo}. ${c.nombre}` }))] }),
          campo({ nombre: 'buscar', etiqueta: 'Buscar por código o descripción', tipo: 'busqueda' }),
          h('button', { type: 'submit', class: 'boton boton-oscuro', text: 'Buscar' }));
        async function buscar() {
          try {
            const { capituloId, buscar: termino } = leerFormulario(form);
            const q = new URLSearchParams({ porPagina: 30 });
            if (capituloId) q.set('capituloId', capituloId);
            if (termino) q.set('buscar', termino);
            const r = await obtener(`/api/admin/cotizador/actividades?${q}`);
            resultados.replaceChildren(tabla({
              titulo: 'Actividades', vacio: 'Elige un capítulo o escribe al menos 3 letras para buscar.', filas: r.actividades,
              columnas: [
                { titulo: 'Código', valor: (a) => a.codigo }, { titulo: 'Descripción', valor: (a) => a.descripcion }, { titulo: 'Unidad', valor: (a) => a.unidad },
                { titulo: 'Precio unitario', clase: 'numero', valor: (a) => formatoCOP(a.precioUnitario) },
                { titulo: 'Elegir', clase: 'acciones', valor: (a) => h('button', { type: 'button', class: 'boton boton-primario boton-pequeno', text: 'Elegir', 'aria-label': `Elegir ${a.descripcion}`, onClick: () => elegir({ referencia: a.codigo, descripcion: a.descripcion, unidad: a.unidad, precioUnitario: a.precioUnitario }) }) },
              ],
            }));
          } catch (error) { anunciarError(error); }
        }
        form.addEventListener('submit', (e) => { e.preventDefault(); buscar(); });
        form.elements.capituloId.addEventListener('change', () => { if (form.elements.capituloId.value) buscar(); });
        cargando.replaceWith(form);
        cuerpo.append(resultados);
      }).catch(anunciarError);
    } else {
      cuerpo.append(resultados);
      obtener('/api/admin/cotizador/servicios').then((lista) => {
        const items = lista.filter((s) => s.categoria === seccion);
        resultados.replaceChildren(tabla({
          titulo: SECCIONES[seccion], vacio: 'No hay servicios configurados en esta pestaña.', filas: items,
          columnas: [
            { titulo: 'Servicio', valor: (s) => s.nombre }, { titulo: 'Cómo se cobra', valor: (s) => s.unidadTexto }, { titulo: 'Precio', clase: 'numero', valor: (s) => formatoCOP(s.precio) },
            { titulo: 'Elegir', clase: 'acciones', valor: (s) => h('button', { type: 'button', class: 'boton boton-primario boton-pequeno', text: 'Elegir', 'aria-label': `Elegir ${s.nombre}`, onClick: () => elegir({ referencia: String(s.id), descripcion: s.nombre, unidad: s.unidadTexto, precioUnitario: s.precio }) }) },
          ],
        }));
      }).catch(anunciarError);
    }
    pie.append(h('button', { type: 'button', class: 'boton boton-secundario', text: 'Cancelar', onClick: () => cerrar() }));
  });
}
