/**
 * Precios del cotizador (solo administradores):
 * servicios de consultoría y financieros, porcentajes AIU y textos,
 * capítulos, actividades con su análisis de precios (APU) e insumos.
 */
import { eliminar, enviar, obtener, reemplazar } from '../api.js';
import { elegirMedio, listaOrdenable } from '../componentes.js';
import {
  abrirDialogo, anunciar, anunciarError, campo, confirmar, conBotonOcupado, formatoCOP, h, leerFormulario,
  mostrarErrores, paginacion, pestanas, tabla,
} from '../ui.js';
import { encabezado } from './comun.js';

const UNIDADES = [{ valor: 'M2', texto: 'Por m²' }, { valor: 'GLOBAL', texto: 'Global (una vez)' }, { valor: 'MES', texto: 'Por mes' }, { valor: 'UNIDAD', texto: 'Por unidad' }, { valor: 'HORA', texto: 'Por hora' }];
const TIPOS_INSUMO = [
  { valor: 'MATERIAL', texto: 'Material' }, { valor: 'EQUIPO', texto: 'Equipo y herramienta' }, { valor: 'MANO_OBRA', texto: 'Mano de obra' },
  { valor: 'TRANSPORTE', texto: 'Transporte' }, { valor: 'SUBCONTRATO', texto: 'Subcontrato' }, { valor: 'AUXILIAR', texto: 'Auxiliar (tiene su propio análisis)' }, { valor: 'OTRO', texto: 'Otro' },
];
const GRUPOS = ['MATERIALES', 'EQUIPO', 'MANO_OBRA', 'TRANSPORTE', 'SUBCONTRATO', 'OTROS', 'PERSONAL', 'SEGURIDAD_SOCIAL', 'PRESTACIONES', 'PARAFISCALES'];
const nombreGrupo = (g) => g.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

export async function mostrar(contenedor, ctx) {
  contenedor.append(
    encabezado(ctx.titulo, 'Estos datos alimentan el simulador de cotización del sitio. Los visitantes solo ven nombres y unidades; los precios aparecen únicamente en el resultado de su cotización. Los cambios de precios aplican de inmediato (no necesitan publicarse).'),
    pestanas({
      etiqueta: 'Partes del cotizador',
      opciones: [
        { texto: 'Servicios', fn: servicios }, { texto: 'Porcentajes y textos', fn: configuracion },
        { texto: 'Capítulos', fn: capitulos }, { texto: 'Actividades', fn: actividades }, { texto: 'Insumos', fn: insumos },
      ],
      alElegir: (o, panel) => o.fn(panel).catch(anunciarError),
    }),
  );
}

// ─── Servicios de consultoría y financieros ───────────────────────────
async function servicios(panel) {
  const lista = await obtener('/api/admin/cotizador/servicios');
  panel.append(h('p', { class: 'mensaje mensaje-info', text: 'Los precios marcados como «provisional» son valores de ejemplo. Reemplázalos por las tarifas reales de Zenite antes de usar el cotizador con clientes.' }));
  for (const [categoria, titulo] of [['CONSULTORIA', 'Análisis y consultoría'], ['FINANCIERA', 'Financiera y costos']]) {
    const items = lista.filter((s) => s.categoria === categoria);
    panel.append(h('section', { class: 'tarjeta', 'aria-label': titulo }, h('div', { class: 'encabezado-vista' }, h('h2', { text: `Pestaña «${titulo}»` }),
      h('button', { type: 'button', class: 'boton boton-primario', text: 'Agregar servicio', onClick: () => formularioServicio({ categoria }, panel) })),
      items.length ? listaOrdenable({
        etiqueta: `Servicios de ${titulo}`,
        elementos: items,
        alOrdenar: (ids) => reemplazar('/api/admin/cotizador/servicios/orden', { ids: [...ids, ...lista.filter((s) => s.categoria !== categoria).map((s) => s.id)] }),
        pintar: (s) => ({
          titulo: s.nombre,
          detalle: `${formatoCOP(s.precio)} · ${s.unidadTexto}${s.cargoMinimo ? ` · mínimo ${formatoCOP(s.cargoMinimo)}` : ''}${s.provisional ? ' · provisional' : ''}`,
          oculto: !s.visible,
          acciones: [
            h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Editar', 'aria-label': `Editar ${s.nombre}`, onClick: () => formularioServicio(s, panel) }),
            h('button', {
              type: 'button', class: 'boton boton-peligro boton-pequeno', text: 'Eliminar', 'aria-label': `Eliminar ${s.nombre}`,
              onClick: async () => {
                if (!(await confirmar({ titulo: 'Eliminar servicio', mensaje: `¿Eliminar «${s.nombre}»?`, detalle: 'Las cotizaciones ya enviadas conservan sus valores.', aceptar: 'Eliminar', peligro: true }))) return;
                try { await eliminar(`/api/admin/cotizador/servicios/${s.id}`); anunciar('Servicio eliminado.'); recargar(panel, servicios); } catch (e) { anunciarError(e); }
              },
            }),
          ],
        }),
      }) : h('p', { class: 'vacio', text: 'No hay servicios en esta pestaña.' })));
  }
}

function formularioServicio(s, panel) {
  const nuevo = !s.id;
  const { cuerpo, pie, cerrar } = abrirDialogo({ titulo: nuevo ? 'Agregar servicio' : 'Editar servicio' });
  const form = h('form', { id: 'form-servicio', novalidate: true },
    campo({ nombre: 'categoria', etiqueta: 'Pestaña del simulador', tipo: 'seleccion', valor: s.categoria, requerido: true, opciones: [{ valor: 'CONSULTORIA', texto: 'Análisis y consultoría' }, { valor: 'FINANCIERA', texto: 'Financiera y costos' }] }),
    campo({ nombre: 'nombre', etiqueta: 'Nombre', valor: s.nombre, requerido: true, max: 120 }),
    campo({ nombre: 'descripcion', etiqueta: 'Descripción para el cliente', tipo: 'area', valor: s.descripcion, requerido: true, max: 400 }),
    h('div', { class: 'fila-campos' },
      campo({ nombre: 'unidad', etiqueta: 'Cómo se cobra', tipo: 'seleccion', valor: s.unidad ?? 'GLOBAL', opciones: UNIDADES, requerido: true }),
      campo({ nombre: 'precio', etiqueta: 'Precio (pesos)', tipo: 'numero', paso: 'entero', valor: s.precio, requerido: true, ayuda: 'Sin puntos ni signo $. Ej.: 1500000' }),
      campo({ nombre: 'cargoMinimo', etiqueta: 'Cargo mínimo (opcional)', tipo: 'numero', paso: 'entero', valor: s.cargoMinimo, ayuda: 'Útil en cobros por m².' })),
    campo({ nombre: 'provisional', etiqueta: 'Precio provisional (de ejemplo)', tipo: 'casilla', valor: s.provisional ?? false }),
    campo({ nombre: 'visible', etiqueta: 'Mostrar en el simulador', tipo: 'casilla', valor: s.visible ?? true }));
  cuerpo.append(form);
  const guardar = h('button', { type: 'submit', form: 'form-servicio', class: 'boton boton-primario', text: 'Guardar' });
  pie.append(h('button', { type: 'button', class: 'boton boton-secundario', text: 'Cancelar', onClick: () => cerrar() }), guardar);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const d = leerFormulario(form);
      await conBotonOcupado(guardar, () => (nuevo ? enviar('/api/admin/cotizador/servicios', d) : reemplazar(`/api/admin/cotizador/servicios/${s.id}`, d)));
      cerrar();
      anunciar('Servicio guardado.');
      recargar(panel, servicios);
    } catch (error) { mostrarErrores(form, error); }
  });
}

function recargar(panel, fn) {
  panel.replaceChildren();
  fn(panel).catch(anunciarError);
}

// ─── Porcentajes y textos ─────────────────────────────────────────────
async function configuracion(panel) {
  const c = await obtener('/api/admin/cotizador/configuracion');
  const form = h('form', { class: 'tarjeta', novalidate: true },
    h('fieldset', {}, h('legend', { text: 'AIU de la pestaña Construcción (en %)' }),
      h('p', { class: 'texto-suave texto-pequeno', text: 'Se aplican sobre el costo directo de las actividades. El IVA se calcula sobre la utilidad, como en la base de precios.' }),
      h('div', { class: 'fila-campos' },
        campo({ nombre: 'administracion', etiqueta: 'Administración %', tipo: 'numero', valor: c.administracion, requerido: true }),
        campo({ nombre: 'imprevistos', etiqueta: 'Imprevistos %', tipo: 'numero', valor: c.imprevistos, requerido: true }),
        campo({ nombre: 'utilidad', etiqueta: 'Utilidad %', tipo: 'numero', valor: c.utilidad, requerido: true }),
        campo({ nombre: 'ivaSobreUtilidad', etiqueta: 'IVA sobre la utilidad %', tipo: 'numero', valor: c.ivaSobreUtilidad, requerido: true }))),
    h('div', { class: 'fila-campos' },
      campo({ nombre: 'correoDestino', etiqueta: 'Correo que recibe las cotizaciones', tipo: 'correo', valor: c.correoDestino, requerido: true }),
      campo({ nombre: 'validezDias', etiqueta: 'Validez de la oferta (días)', tipo: 'numero', paso: 'entero', valor: c.validezDias, requerido: true }),
      campo({ nombre: 'maxLineas', etiqueta: 'Máximo de ítems por cotización', tipo: 'numero', paso: 'entero', valor: c.maxLineas, requerido: true })),
    campo({ nombre: 'avisoReferencial', etiqueta: 'Aviso de valor referencial', tipo: 'area', valor: c.avisoReferencial, requerido: true, max: 800, ayuda: 'Se muestra en el simulador y en el documento Word.' }),
    campo({ nombre: 'condicionesPago', etiqueta: 'Condiciones de pago', tipo: 'area', valor: c.condicionesPago, requerido: true, max: 800 }),
    campo({ nombre: 'datosPago', etiqueta: 'Datos para el pago', valor: c.datosPago, max: 300, ayuda: 'Ej.: Cuenta de ahorros Davivienda N.° …' }));
  const guardar = h('button', { type: 'submit', class: 'boton boton-primario', text: 'Guardar configuración' });
  form.append(guardar);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await conBotonOcupado(guardar, () => reemplazar('/api/admin/cotizador/configuracion', leerFormulario(form))); form.querySelector('.resumen-errores')?.remove(); anunciar('Configuración guardada.'); } catch (error) { mostrarErrores(form, error); }
  });
  panel.append(form);
}

// ─── Capítulos ────────────────────────────────────────────────────────
async function capitulos(panel) {
  const lista = await obtener('/api/admin/cotizador/capitulos');
  panel.append(h('div', { class: 'encabezado-vista' }, h('h2', { text: 'Capítulos de obra' }),
    h('button', { type: 'button', class: 'boton boton-primario', text: 'Agregar capítulo', onClick: () => formularioCapitulo({}, panel) })),
  tabla({
    titulo: 'Capítulos de obra',
    filas: lista,
    columnas: [
      { titulo: 'Código', valor: (c) => c.codigo },
      { titulo: 'Nombre', valor: (c) => c.nombre },
      { titulo: 'Actividades', clase: 'numero', valor: (c) => c.actividades },
      { titulo: 'En el simulador', valor: (c) => h('span', { class: `insignia ${c.visiblePublico ? 'insignia-exito' : 'insignia-aviso'}`, text: c.visiblePublico ? 'Visible' : 'Oculto' }) },
      {
        titulo: 'Acciones', clase: 'acciones', valor: (c) => [
          h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Editar', 'aria-label': `Editar capítulo ${c.codigo}`, onClick: () => formularioCapitulo(c, panel) }),
          h('button', {
            type: 'button', class: 'boton boton-peligro boton-pequeno', text: 'Eliminar', 'aria-label': `Eliminar capítulo ${c.codigo}`, disabled: c.actividades > 0, title: c.actividades ? 'Tiene actividades' : null,
            onClick: async () => {
              if (!(await confirmar({ titulo: 'Eliminar capítulo', mensaje: `¿Eliminar el capítulo ${c.codigo} ${c.nombre}?`, aceptar: 'Eliminar', peligro: true }))) return;
              try { await eliminar(`/api/admin/cotizador/capitulos/${c.id}`); anunciar('Capítulo eliminado.'); recargar(panel, capitulos); } catch (e) { anunciarError(e); }
            },
          }),
        ],
      },
    ],
  }));
}

function formularioCapitulo(c, panel) {
  const { cuerpo, pie, cerrar } = abrirDialogo({ titulo: c.id ? 'Editar capítulo' : 'Agregar capítulo', tamano: 'estrecho' });
  const form = h('form', { id: 'form-capitulo', novalidate: true },
    campo({ nombre: 'codigo', etiqueta: 'Código', valor: c.codigo, requerido: true, max: 10, ayuda: 'Ej.: 30' }),
    campo({ nombre: 'nombre', etiqueta: 'Nombre', valor: c.nombre, requerido: true, max: 120 }),
    campo({ nombre: 'visiblePublico', etiqueta: 'Mostrar en el simulador', tipo: 'casilla', valor: c.visiblePublico ?? true }));
  cuerpo.append(form);
  const guardar = h('button', { type: 'submit', form: 'form-capitulo', class: 'boton boton-primario', text: 'Guardar' });
  pie.append(h('button', { type: 'button', class: 'boton boton-secundario', text: 'Cancelar', onClick: () => cerrar() }), guardar);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const d = leerFormulario(form);
      await conBotonOcupado(guardar, () => (c.id ? reemplazar(`/api/admin/cotizador/capitulos/${c.id}`, d) : enviar('/api/admin/cotizador/capitulos', d)));
      cerrar(); anunciar('Capítulo guardado.'); recargar(panel, capitulos);
    } catch (error) { mostrarErrores(form, error); }
  });
}

// ─── Actividades y APU ────────────────────────────────────────────────
async function actividades(panel) {
  const caps = await obtener('/api/admin/cotizador/capitulos');
  const estado = { buscar: '', capituloId: '', pagina: 1 };
  const resultados = h('div', { 'aria-live': 'polite' });
  const filtros = h('form', { class: 'barra-filtros', role: 'search', 'aria-label': 'Buscar actividades' },
    campo({ nombre: 'capituloId', etiqueta: 'Capítulo', tipo: 'seleccion', opciones: [{ valor: '', texto: 'Todos' }, ...caps.map((c) => ({ valor: c.id, texto: `${c.codigo}. ${c.nombre}` }))] }),
    campo({ nombre: 'buscar', etiqueta: 'Buscar por código o descripción', tipo: 'busqueda' }),
    h('button', { type: 'submit', class: 'boton boton-oscuro', text: 'Buscar' }),
    h('button', { type: 'button', class: 'boton boton-primario', text: 'Agregar actividad', onClick: () => formularioActividad(null, caps, cargar) }));
  filtros.addEventListener('submit', (e) => { e.preventDefault(); Object.assign(estado, leerFormulario(filtros), { pagina: 1 }); cargar(); });
  panel.append(h('p', { class: 'texto-suave texto-pequeno', text: 'El precio de cada actividad se calcula con su análisis de precios unitarios (APU): cantidades × precios de los insumos. Si cambias un insumo, se recalculan las actividades que lo usan.' }), filtros, resultados);

  async function cargar() {
    const q = new URLSearchParams({ pagina: estado.pagina, porPagina: 25 });
    if (estado.buscar) q.set('buscar', estado.buscar);
    if (estado.capituloId) q.set('capituloId', estado.capituloId);
    const r = await obtener(`/api/admin/cotizador/actividades?${q}`);
    resultados.replaceChildren(tabla({
      titulo: 'Actividades',
      vacio: 'No encontramos actividades con esos filtros.',
      filas: r.actividades,
      columnas: [
        { titulo: 'Código', valor: (a) => a.codigo },
        { titulo: 'Descripción', valor: (a) => [a.descripcion, a.subcapitulo ? h('span', { class: 'texto-suave texto-pequeno', text: ` (${a.subcapitulo})` }) : null, !a.visiblePublico ? h('span', { class: 'insignia insignia-aviso', text: ' Oculta' }) : null] },
        { titulo: 'Unidad', valor: (a) => a.unidad },
        { titulo: 'Precio unitario', clase: 'numero', valor: (a) => formatoCOP(a.precioUnitario) },
        { titulo: 'Acciones', clase: 'acciones', valor: (a) => h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Ver / editar', 'aria-label': `Ver o editar actividad ${a.codigo}`, onClick: () => formularioActividad(a.id, caps, cargar) }) },
      ],
    }), paginacion({ total: r.total, pagina: r.pagina, porPagina: r.porPagina, alCambiar: (p) => { estado.pagina = p; cargar().catch(anunciarError); } }));
  }
  await cargar();
}

async function formularioActividad(id, caps, recargarLista) {
  const a = id ? await obtener(`/api/admin/cotizador/actividades/${id}`) : { componentes: [], visiblePublico: true };
  const { cuerpo, pie, cerrar } = abrirDialogo({ titulo: id ? `Actividad ${a.codigo}` : 'Agregar actividad', tamano: 'ancho' });
  const form = h('form', { id: 'form-actividad', novalidate: true },
    h('div', { class: 'fila-campos' },
      campo({ nombre: 'codigo', etiqueta: 'Código', valor: a.codigo, requerido: true, max: 20, ayuda: 'Ej.: 3.15' }),
      campo({ nombre: 'capituloId', etiqueta: 'Capítulo', tipo: 'seleccion', valor: a.capituloId, requerido: true, opciones: [{ valor: '', texto: 'Elige' }, ...caps.map((c) => ({ valor: c.id, texto: `${c.codigo}. ${c.nombre}` }))] }),
      campo({ nombre: 'unidad', etiqueta: 'Unidad', valor: a.unidad, requerido: true, max: 20, ayuda: 'm2, m3, ml, Un…' })),
    campo({ nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'area', filas: 2, valor: a.descripcion, requerido: true, max: 400 }),
    campo({ nombre: 'subcapitulo', etiqueta: 'Subcapítulo (opcional)', valor: a.subcapitulo, max: 120 }),
    a.componentes.length ? null : campo({ nombre: 'precioUnitario', etiqueta: 'Precio unitario (si no tiene APU)', tipo: 'numero', valor: a.precioUnitario, ayuda: 'Si agregas componentes de APU, el precio se calcula solo.' }),
    campo({ nombre: 'visiblePublico', etiqueta: 'Disponible en el simulador', tipo: 'casilla', valor: a.visiblePublico }));
  cuerpo.append(form);
  const guardar = h('button', { type: 'submit', form: 'form-actividad', class: 'boton boton-primario', text: 'Guardar datos' });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const d = leerFormulario(form);
      const r = await conBotonOcupado(guardar, () => (id ? reemplazar(`/api/admin/cotizador/actividades/${id}`, d) : enviar('/api/admin/cotizador/actividades', d)));
      anunciar('Actividad guardada.');
      recargarLista().catch(anunciarError);
      if (!id) { cerrar(); formularioActividad(r.id, caps, recargarLista); }
    } catch (error) { mostrarErrores(form, error); }
  });
  pie.append(h('button', { type: 'button', class: 'boton boton-secundario', text: 'Cerrar', onClick: () => cerrar() }), guardar);
  if (id) cuerpo.append(editorApu(a, recargarLista));
}

/** Editor del análisis de precios unitarios: filas de insumos con cantidad. */
function editorApu(a, recargarLista) {
  let filas = a.componentes.map((c) => ({ ...c }));
  const zona = h('section', { 'aria-labelledby': 'titulo-apu', class: 'tarjeta' });
  const total = h('p', { class: 'dato-grande', role: 'status' });
  const tablaZona = h('div');
  const guardarApu = h('button', { type: 'button', class: 'boton boton-oscuro', text: 'Guardar análisis y recalcular' });

  function pintar() {
    tablaZona.replaceChildren(filas.length ? h('div', { class: 'tabla-envoltura' }, h('table', { class: 'tabla' },
      h('caption', { class: 'visualmente-oculto', text: 'Componentes del análisis de precios' }),
      h('thead', {}, h('tr', {}, ['Grupo', 'Insumo', 'Unidad', 'Cantidad', 'Precio / base', 'Acciones'].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, filas.map((f, i) => {
        const grupo = h('select', { 'aria-label': `Grupo de la fila ${i + 1}`, onChange: (e) => { f.grupo = e.target.value; } }, GRUPOS.map((g) => h('option', { value: g, text: nombreGrupo(g), selected: g === f.grupo })));
        const cantidad = h('input', { type: 'text', inputmode: 'decimal', value: String(f.cantidad ?? ''), 'aria-label': `Cantidad de la fila ${i + 1}${f.porcentaje ? ' (porcentaje)' : ''}`, size: 8, onInput: (e) => { f.cantidad = e.target.value; } });
        const precio = f.insumoId
          ? h('span', { text: formatoCOP(f.insumo?.precio ?? f.precio) })
          : h('input', { type: 'text', inputmode: 'decimal', value: String(f.precio ?? ''), 'aria-label': `Precio o base de la fila ${i + 1}`, size: 10, onInput: (e) => { f.precio = e.target.value; } });
        return h('tr', {},
          h('td', { class: 'campo' }, grupo),
          h('th', { scope: 'row' }, f.descripcion ?? f.insumo?.descripcion ?? '—', f.porcentaje ? h('span', { class: 'insignia', text: ' % ' }) : null),
          h('td', { text: f.unidad ?? f.insumo?.unidad ?? '' }),
          h('td', { class: 'campo' }, cantidad),
          h('td', { class: 'campo numero' }, precio),
          h('td', { class: 'acciones' }, h('button', { type: 'button', class: 'boton boton-peligro boton-pequeno', text: 'Quitar', 'aria-label': `Quitar fila ${i + 1}: ${f.descripcion}`, onClick: () => { filas.splice(i, 1); pintar(); anunciar('Fila quitada. Guarda para aplicar el cambio.'); } })));
      })))) : h('p', { class: 'vacio', text: 'Esta actividad no tiene análisis de precios. Su precio se escribe a mano.' }));
  }

  async function agregarInsumo() {
    const insumo = await buscarInsumo();
    if (!insumo) return;
    const grupo = { MATERIAL: 'MATERIALES', EQUIPO: 'EQUIPO', MANO_OBRA: 'MANO_OBRA', TRANSPORTE: 'TRANSPORTE', SUBCONTRATO: 'SUBCONTRATO' }[insumo.tipo] ?? 'OTROS';
    filas.push({ grupo, insumoId: insumo.id, insumo, descripcion: insumo.descripcion, unidad: insumo.unidad, cantidad: 1, precio: insumo.precio, porcentaje: false });
    pintar();
    anunciar(`Agregado ${insumo.descripcion}. Escribe la cantidad.`);
    tablaZona.querySelector('tbody tr:last-child input')?.focus();
  }

  function agregarPorcentaje() {
    filas.push({ grupo: 'EQUIPO', insumoId: null, descripcion: 'HERRAMIENTA MENOR %', unidad: '%MO', cantidad: 5, precio: 0, porcentaje: true });
    pintar();
    anunciar('Fila de porcentaje agregada (porcentaje sobre la mano de obra).');
  }

  guardarApu.addEventListener('click', async () => {
    try {
      const datos = filas.map((f) => ({ grupo: f.grupo, insumoId: f.insumoId ?? null, descripcion: f.descripcion, unidad: f.unidad, cantidad: f.cantidad, precio: f.precio, porcentaje: f.porcentaje }));
      const r = await conBotonOcupado(guardarApu, () => reemplazar(`/api/admin/cotizador/actividades/${a.id}/componentes`, { componentes: datos }), 'Recalculando…');
      filas = r.componentes.map((c) => ({ ...c }));
      total.textContent = formatoCOP(r.precioUnitario);
      pintar();
      anunciar(`Análisis guardado. Nuevo precio unitario: ${formatoCOP(r.precioUnitario)}.`);
      recargarLista().catch(() => {});
    } catch (error) { anunciarError(error); }
  });

  total.textContent = formatoCOP(a.precioUnitario);
  zona.append(h('h3', { id: 'titulo-apu', text: 'Análisis de precios unitarios (APU)' }), h('p', { class: 'texto-suave texto-pequeno' }, 'Precio unitario actual: '), total,
    h('p', { class: 'texto-suave texto-pequeno', text: 'Las filas en % (unidad «%MO») se calculan sobre el subtotal de mano de obra de esta actividad.' }),
    tablaZona,
    h('div', { class: 'grupo-botones' },
      h('button', { type: 'button', class: 'boton boton-secundario', text: 'Agregar insumo', onClick: agregarInsumo }),
      h('button', { type: 'button', class: 'boton boton-secundario', text: 'Agregar porcentaje de herramienta', onClick: agregarPorcentaje }),
      guardarApu));
  pintar();
  return zona;
}

/** Diálogo para buscar y elegir un insumo. */
function buscarInsumo() {
  return new Promise((resolver) => {
    let elegido = null;
    const { cuerpo, pie, cerrar } = abrirDialogo({ titulo: 'Elegir insumo', alCerrar: () => resolver(elegido) });
    const resultados = h('div', { 'aria-live': 'polite' });
    const form = h('form', { class: 'barra-filtros', role: 'search' }, campo({ nombre: 'buscar', etiqueta: 'Buscar insumo', tipo: 'busqueda', ayuda: 'Ej.: cemento, cuadrilla, bloque' }), h('button', { type: 'submit', class: 'boton boton-oscuro', text: 'Buscar' }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await obtener(`/api/admin/cotizador/insumos?buscar=${encodeURIComponent(form.elements.buscar.value)}&porPagina=30`);
        resultados.replaceChildren(tabla({
          titulo: 'Insumos encontrados', vacio: 'Sin resultados.', filas: r.insumos,
          columnas: [
            { titulo: 'Insumo', valor: (i) => i.descripcion }, { titulo: 'Unidad', valor: (i) => i.unidad }, { titulo: 'Precio', clase: 'numero', valor: (i) => formatoCOP(i.precio) },
            { titulo: 'Elegir', clase: 'acciones', valor: (i) => h('button', { type: 'button', class: 'boton boton-primario boton-pequeno', text: 'Elegir', 'aria-label': `Elegir ${i.descripcion}`, onClick: () => { elegido = i; cerrar(); } }) },
          ],
        }));
      } catch (error) { anunciarError(error); }
    });
    cuerpo.append(form, resultados);
    pie.append(h('button', { type: 'button', class: 'boton boton-secundario', text: 'Cancelar', onClick: () => cerrar() }));
  });
}

// ─── Insumos ──────────────────────────────────────────────────────────
async function insumos(panel) {
  const estado = { buscar: '', tipo: '', pagina: 1 };
  const resultados = h('div', { 'aria-live': 'polite' });
  const filtros = h('form', { class: 'barra-filtros', role: 'search', 'aria-label': 'Buscar insumos' },
    campo({ nombre: 'tipo', etiqueta: 'Tipo', tipo: 'seleccion', opciones: [{ valor: '', texto: 'Todos' }, ...TIPOS_INSUMO] }),
    campo({ nombre: 'buscar', etiqueta: 'Buscar insumo', tipo: 'busqueda' }),
    h('button', { type: 'submit', class: 'boton boton-oscuro', text: 'Buscar' }),
    h('button', { type: 'button', class: 'boton boton-primario', text: 'Agregar insumo', onClick: () => formularioInsumo({}, cargar) }));
  filtros.addEventListener('submit', (e) => { e.preventDefault(); Object.assign(estado, leerFormulario(filtros), { pagina: 1 }); cargar(); });
  panel.append(h('p', { class: 'texto-suave texto-pequeno', text: 'Materiales, equipos, mano de obra y cuadrillas con su precio. Al cambiar un precio se recalculan automáticamente todas las actividades que lo usan.' }), filtros, resultados);

  async function cargar() {
    const q = new URLSearchParams({ pagina: estado.pagina, porPagina: 25 });
    if (estado.buscar) q.set('buscar', estado.buscar);
    if (estado.tipo) q.set('tipo', estado.tipo);
    const r = await obtener(`/api/admin/cotizador/insumos?${q}`);
    resultados.replaceChildren(tabla({
      titulo: 'Insumos', vacio: 'No encontramos insumos.', filas: r.insumos,
      columnas: [
        {
          titulo: 'Foto', valor: (i) => i.imagen
            ? h('img', { src: i.imagen.url960 ?? i.imagen.url, alt: i.imagen.alt ?? '', loading: 'lazy', class: 'miniatura-insumo' })
            : h('span', { class: 'texto-suave texto-pequeno', text: '—' }),
        },
        { titulo: 'Insumo', valor: (i) => i.descripcion },
        { titulo: 'Unidad', valor: (i) => i.unidad },
        { titulo: 'Tipo', valor: (i) => TIPOS_INSUMO.find((t) => t.valor === i.tipo)?.texto.split(' (')[0] ?? i.tipo },
        { titulo: 'Precio', clase: 'numero', valor: (i) => formatoCOP(i.precio) },
        {
          titulo: 'Acciones', clase: 'acciones', valor: (i) => [
            h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Editar', 'aria-label': `Editar ${i.descripcion}`, onClick: () => formularioInsumo(i, cargar) }),
            h('button', {
              type: 'button', class: 'boton boton-peligro boton-pequeno', text: 'Eliminar', 'aria-label': `Eliminar ${i.descripcion}`,
              onClick: async () => {
                if (!(await confirmar({ titulo: 'Eliminar insumo', mensaje: `¿Eliminar «${i.descripcion}»?`, aceptar: 'Eliminar', peligro: true }))) return;
                try { await eliminar(`/api/admin/cotizador/insumos/${i.id}`); anunciar('Insumo eliminado.'); cargar(); } catch (e) { anunciarError(e); }
              },
            }),
          ],
        },
      ],
    }), paginacion({ total: r.total, pagina: r.pagina, porPagina: r.porPagina, alCambiar: (p) => { estado.pagina = p; cargar().catch(anunciarError); } }));
  }
  await cargar();
}

/** Campo de foto del insumo: usa la biblioteca de medios, sin texto alternativo propio (ya lo tiene la foto). */
function campoFotoInsumo(imagen) {
  const oculto = h('input', { type: 'hidden', name: 'imagenId', value: imagen?.id ?? '' });
  const vista = h('div', { class: 'vista-previa-imagen' });
  const botonElegir = h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno' });
  const contenedor = h('fieldset', {}, h('legend', { text: 'Foto del material' }), oculto, vista);

  function pintar(m) {
    vista.replaceChildren();
    if (m) vista.append(h('img', { src: m.url960 ?? m.variantes?.['960'] ?? m.url, alt: '' }));
    else vista.append(h('span', { class: 'texto-suave', text: 'Sin foto' }));
    botonElegir.textContent = m ? 'Cambiar foto' : 'Elegir foto';
    vista.append(botonElegir);
    if (m) {
      vista.append(h('button', {
        type: 'button', class: 'boton boton-peligro boton-pequeno', text: 'Quitar foto',
        onClick: () => { oculto.value = ''; pintar(null); anunciar('Foto quitada. Guarda para aplicar el cambio.'); botonElegir.focus(); },
      }));
    }
  }
  botonElegir.addEventListener('click', async () => {
    const elegidos = await elegirMedio({ tipo: 'IMAGEN' });
    if (!elegidos?.length) return;
    const m = elegidos[0];
    oculto.value = m.id;
    pintar(m);
    anunciar('Foto elegida.');
  });
  pintar(imagen);
  return contenedor;
}

function formularioInsumo(i, recargarLista) {
  const { cuerpo, pie, cerrar } = abrirDialogo({ titulo: i.id ? 'Editar insumo' : 'Agregar insumo' });
  const form = h('form', { id: 'form-insumo', novalidate: true },
    campo({ nombre: 'descripcion', etiqueta: 'Descripción', valor: i.descripcion, requerido: true, max: 300 }),
    h('div', { class: 'fila-campos' },
      campo({ nombre: 'unidad', etiqueta: 'Unidad', valor: i.unidad, requerido: true, max: 20 }),
      campo({ nombre: 'tipo', etiqueta: 'Tipo', tipo: 'seleccion', valor: i.tipo ?? 'MATERIAL', opciones: TIPOS_INSUMO, requerido: true }),
      campo({ nombre: 'precio', etiqueta: 'Precio (pesos)', tipo: 'numero', valor: i.precio, requerido: true })),
    campoFotoInsumo(i.imagen),
    i.tipo === 'AUXILIAR' ? h('p', { class: 'texto-pequeno texto-suave', text: 'Este insumo es auxiliar: su precio se calcula con su propio análisis cuando se recalculan las actividades.' }) : null);
  cuerpo.append(form);
  const guardar = h('button', { type: 'submit', form: 'form-insumo', class: 'boton boton-primario', text: 'Guardar' });
  pie.append(h('button', { type: 'button', class: 'boton boton-secundario', text: 'Cancelar', onClick: () => cerrar() }), guardar);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const d = leerFormulario(form);
      const r = await conBotonOcupado(guardar, () => (i.id ? reemplazar(`/api/admin/cotizador/insumos/${i.id}`, d) : enviar('/api/admin/cotizador/insumos', d)), 'Guardando y recalculando…');
      cerrar();
      anunciar(r.recalculo?.cambiadas ? `Insumo guardado. Se recalcularon ${r.recalculo.cambiadas} actividades.` : 'Insumo guardado.');
      recargarLista().catch(anunciarError);
    } catch (error) { mostrarErrores(form, error); }
  });
}

