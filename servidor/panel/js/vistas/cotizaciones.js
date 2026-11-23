/** Cotizaciones generadas desde el simulador: detalle, documento Word y reenvío. */
import { descargar, enviar, obtener } from '../api.js';
import { abrirDialogo, anunciar, anunciarError, campo, conBotonOcupado, formatoCOP, formatoFecha, formatoNumero, h, leerFormulario, paginacion, tabla } from '../ui.js';
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
            h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Ver', 'aria-label': `Ver cotización ${c.codigo}`, onClick: () => detalle(c.id) }),
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

async function detalle(id) {
  const c = await obtener(`/api/admin/cotizaciones/${id}`);
  const { cuerpo, pie, cerrar } = abrirDialogo({ titulo: `Cotización ${c.codigo}`, tamano: 'ancho' });
  cuerpo.append(h('p', { text: `${c.nombreCliente} · ${c.correoCliente} · ${c.telefonoCliente}${c.ciudad ? ` · ${c.ciudad}` : ''}${c.areaM2 ? ` · ${formatoNumero(c.areaM2)} m²` : ''}` }),
    c.errorEnvio ? h('p', { class: 'mensaje mensaje-error', text: `No se pudo enviar el correo: ${c.errorEnvio}` }) : '');
  for (const [clave, nombre] of Object.entries(SECCIONES)) {
    const lineas = c.lineas.filter((l) => l.seccion === clave);
    if (!lineas.length) continue;
    cuerpo.append(h('h3', { text: nombre }), tabla({
      titulo: nombre, filas: lineas,
      columnas: [
        { titulo: 'Ítem', valor: (l) => l.referencia ?? '—' }, { titulo: 'Descripción', valor: (l) => l.descripcion }, { titulo: 'Unidad', valor: (l) => l.unidad },
        { titulo: 'Cantidad', clase: 'numero', valor: (l) => formatoNumero(l.cantidad) }, { titulo: 'Vr. unitario', clase: 'numero', valor: (l) => formatoCOP(l.precioUnitario) }, { titulo: 'Valor', clase: 'numero', valor: (l) => formatoCOP(l.valor) },
      ],
    }));
  }
  const filas = [['Análisis y consultoría', c.subtotalConsultoria], ['Construcción (costo directo)', c.subtotalConstruccion], ['Administración', c.administracion], ['Imprevistos', c.imprevistos], ['Utilidad', c.utilidad], ['IVA sobre utilidad', c.ivaUtilidad], ['Financiera y costos', c.subtotalFinanciera], ['Total referencial', c.total]].filter(([, v]) => v);
  cuerpo.append(h('h3', { text: 'Resumen' }), tabla({ titulo: 'Resumen', filas, columnas: [{ titulo: 'Concepto', valor: (f) => f[0] }, { titulo: 'Valor', clase: 'numero', valor: (f) => formatoCOP(f[1]) }] }));
  pie.append(h('button', { type: 'button', class: 'boton boton-secundario', text: 'Descargar Word', onClick: () => descargar(`/api/admin/cotizaciones/${id}/documento`, `${c.codigo}.docx`).catch(anunciarError) }), h('button', { type: 'button', class: 'boton boton-primario', text: 'Cerrar', onClick: () => cerrar() }));
}
