/**
 * Solicitudes de contacto y del cotizador (datos personales, Ley 1581 de 2012).
 * Solo administradores. Permite cambiar el estado, anotar y eliminar a pedido del titular.
 */
import { descargar, eliminar, modificar, obtener } from '../api.js';
import {
  abrirDialogo, anunciar, anunciarError, campo, confirmar, conBotonOcupado, formatoCOP, formatoFecha, h, leerFormulario, mostrarErrores, paginacion, tabla,
} from '../ui.js';
import { encabezado } from './comun.js';

export const ESTADOS = [
  { valor: 'NUEVA', texto: 'Nueva', clase: 'insignia-aviso' }, { valor: 'EN_REVISION', texto: 'En revisión', clase: '' },
  { valor: 'CONTACTADA', texto: 'Contactada', clase: 'insignia-exito' }, { valor: 'CERRADA', texto: 'Cerrada', clase: 'insignia-oscura' }, { valor: 'DESCARTADA', texto: 'Descartada', clase: '' },
];
const insigniaEstado = (e) => { const x = ESTADOS.find((s) => s.valor === e); return h('span', { class: `insignia ${x?.clase ?? ''}`, text: x?.texto ?? e }); };

export async function mostrar(contenedor, ctx) {
  const estado = { estado: '', buscar: '', pagina: 1 };
  const resultados = h('div', { 'aria-live': 'polite' });
  const filtros = h('form', { class: 'barra-filtros', role: 'search', 'aria-label': 'Filtrar solicitudes' },
    campo({ nombre: 'estado', etiqueta: 'Estado', tipo: 'seleccion', opciones: [{ valor: '', texto: 'Todas' }, ...ESTADOS] }),
    campo({ nombre: 'buscar', etiqueta: 'Buscar por nombre, correo o teléfono', tipo: 'busqueda' }),
    h('button', { type: 'submit', class: 'boton boton-oscuro', text: 'Filtrar' }));
  filtros.addEventListener('submit', (e) => { e.preventDefault(); Object.assign(estado, leerFormulario(filtros), { pagina: 1 }); cargar().catch(anunciarError); });

  contenedor.append(encabezado(ctx.titulo, 'Mensajes del formulario de contacto y solicitudes del simulador de cotización.'),
    h('details', { class: 'tarjeta' }, h('summary', {}, h('strong', { text: 'Tratamiento de datos personales (Ley 1581 de 2012)' })),
      h('ul', {},
        h('li', { text: 'Cada solicitud guarda la autorización de la persona: fecha y versión de la política aceptada.' }),
        h('li', { text: 'Usa estos datos solo para responder la solicitud y dar seguimiento comercial al proyecto.' }),
        h('li', { text: 'Si la persona pide conocer, corregir o suprimir sus datos, atiende la petición en máximo 15 días hábiles. Para suprimirlos usa «Eliminar datos».' }),
        h('li', { text: 'Pasados 24 meses, los datos se anonimizan automáticamente.' }),
        h('li', { text: 'No descargues ni compartas esta información fuera del panel.' }))),
    filtros, resultados);

  async function cargar() {
    const q = new URLSearchParams({ pagina: estado.pagina });
    if (estado.estado) q.set('estado', estado.estado);
    if (estado.buscar) q.set('buscar', estado.buscar);
    const r = await obtener(`/api/admin/solicitudes?${q}`);
    resultados.replaceChildren(tabla({
      titulo: 'Solicitudes', vacio: 'No hay solicitudes con estos filtros.', filas: r.solicitudes,
      columnas: [
        { titulo: 'Fecha', valor: (s) => formatoFecha(s.creada) },
        { titulo: 'Nombre', valor: (s) => s.nombre },
        { titulo: 'Origen', valor: (s) => (s.origen === 'COTIZADOR' ? `Cotizador${s.cotizacion ? ` (${s.cotizacion.codigo})` : ''}` : 'Formulario') },
        { titulo: 'Tipo de proyecto', valor: (s) => s.tipoProyectoNombre ?? (s.tipoProyecto === 'otro' ? 'Otro' : '—') },
        { titulo: 'Estado', valor: (s) => insigniaEstado(s.estado) },
        { titulo: 'Acciones', clase: 'acciones', valor: (s) => h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Ver', 'aria-label': `Ver solicitud de ${s.nombre}`, onClick: () => detalle(s.id, cargar, ctx) }) },
      ],
    }), paginacion({ total: r.total, pagina: r.pagina, porPagina: r.porPagina, alCambiar: (p) => { estado.pagina = p; cargar().catch(anunciarError); } }));
    ctx.actualizarInsignias?.();
  }
  await cargar();
}

async function detalle(id, recargar) {
  const s = await obtener(`/api/admin/solicitudes/${id}`);
  const { cuerpo, pie, cerrar } = abrirDialogo({ titulo: `Solicitud de ${s.nombre}` });
  const tel = s.telefono.replace(/\D/g, '');
  const asuntoCorreo = `Zenite Web · Sobre tu solicitud${s.tipoProyectoNombre ? ` de ${s.tipoProyectoNombre}` : ''}`;
  const cuerpoCorreo = `Hola ${s.nombre},\n\nGracias por contactar a Zenite Web. `;
  const urlGmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(s.correo)}&su=${encodeURIComponent(asuntoCorreo)}&body=${encodeURIComponent(cuerpoCorreo)}`;
  const mensajeWhatsapp = `Hola ${s.nombre}, te saluda Zenite Web. Vimos tu solicitud${s.tipoProyectoNombre ? ` sobre ${s.tipoProyectoNombre}` : ''} y queremos ayudarte.`;
  cuerpo.append(
    h('dl', { class: 'datos' },
      h('dt', { text: 'Correo' }), h('dd', {}, h('a', { href: urlGmail, target: '_blank', rel: 'noopener', text: s.correo })),
      h('dt', { text: 'Teléfono' }), h('dd', {}, h('a', { href: `tel:+57${tel}`, text: s.telefono }), ' · ', h('a', { href: `https://wa.me/57${tel}?text=${encodeURIComponent(mensajeWhatsapp)}`, target: '_blank', rel: 'noopener', text: 'Escribir por WhatsApp (otra pestaña)' })),
      h('dt', { text: 'Tipo de proyecto' }), h('dd', { text: s.tipoProyectoNombre ?? '—' }),
      h('dt', { text: 'Recibida' }), h('dd', { text: formatoFecha(s.creada) }),
      h('dt', { text: 'Autorización de datos' }), h('dd', { text: s.consentimiento ? `Sí, el ${formatoFecha(s.fechaConsentimiento)} (política versión ${s.versionPolitica})` : 'No' }),
      h('dt', { text: 'Se anonimiza el' }), h('dd', { text: formatoFecha(s.eliminarDespues) })),
    h('h3', { text: 'Mensaje' }), h('p', { class: 'json-cambio', text: s.mensaje }),
    s.cotizacion ? h('p', {}, `Cotización ${s.cotizacion.codigo} · ${formatoCOP(s.cotizacion.total)} `,
      h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Descargar Word', onClick: () => descargar(`/api/admin/cotizaciones/${s.cotizacion.id}/documento`, `${s.cotizacion.codigo}.docx`).catch(anunciarError) })) : '');
  const form = h('form', { id: 'form-solicitud', novalidate: true },
    campo({ nombre: 'estado', etiqueta: 'Estado', tipo: 'seleccion', valor: s.estado, opciones: ESTADOS }),
    campo({ nombre: 'notas', etiqueta: 'Notas internas', tipo: 'area', valor: s.notas, max: 2000, ayuda: 'Solo las ven los administradores.' }));
  cuerpo.append(form);
  const guardar = h('button', { type: 'submit', form: 'form-solicitud', class: 'boton boton-primario', text: 'Guardar' });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await conBotonOcupado(guardar, () => modificar(`/api/admin/solicitudes/${id}`, leerFormulario(form))); cerrar(); anunciar('Solicitud actualizada.'); recargar().catch(anunciarError); } catch (error) { mostrarErrores(form, error); }
  });
  pie.append(
    h('button', {
      type: 'button', class: 'boton boton-peligro', text: 'Eliminar datos',
      onClick: async () => {
        const ok = await confirmar({ titulo: 'Eliminar datos personales', mensaje: `¿Eliminar definitivamente los datos de ${s.nombre}${s.cotizacion ? ' y su cotización' : ''}?`, detalle: 'Úsalo cuando la persona pida la supresión de sus datos (Ley 1581). Queda registro en el historial, sin los datos.', aceptar: 'Eliminar datos', peligro: true });
        if (!ok) return;
        try { await eliminar(`/api/admin/solicitudes/${id}`); cerrar(); anunciar('Datos eliminados.'); recargar().catch(anunciarError); } catch (error) { anunciarError(error); }
      },
    }),
    h('button', { type: 'button', class: 'boton boton-secundario', text: 'Cerrar', onClick: () => cerrar() }), guardar);
}
