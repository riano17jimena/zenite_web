/** Historial de cambios: quién cambió qué y cuándo, con el antes y el después. */
import { obtener } from '../api.js';
import { abrirDialogo, anunciarError, campo, formatoFecha, h, leerFormulario, paginacion, tabla } from '../ui.js';
import { encabezado } from './comun.js';

const ACCIONES = { CREAR: 'Creó', ACTUALIZAR: 'Editó', ELIMINAR: 'Eliminó', ORDENAR: 'Ordenó', PUBLICAR: 'Publicó', RESTAURAR: 'Restauró' };
const ENTIDADES = [
  ['', 'Todo'], ['hero', 'Portada'], ['proyecto', 'Portafolio'], ['video', 'Videos'], ['testimonio', 'Testimonios'], ['pregunta', 'Preguntas'], ['contacto', 'Contacto'], ['perfil', 'Perfil'],
  ['medio', 'Fotos y videos'], ['publicacion', 'Publicaciones'], ['servicio', 'Servicios del cotizador'], ['actividad', 'Actividades'], ['insumo', 'Insumos'], ['capitulo', 'Capítulos'],
  ['configuracion', 'Configuración del cotizador'], ['solicitud', 'Solicitudes'], ['usuario', 'Usuarios'], ['respaldo', 'Respaldos'],
];

export async function mostrar(contenedor, ctx) {
  const estado = { entidad: '', pagina: 1 };
  const resultados = h('div', { 'aria-live': 'polite' });
  const filtros = h('form', { class: 'barra-filtros', 'aria-label': 'Filtrar historial' },
    campo({ nombre: 'entidad', etiqueta: 'Sección', tipo: 'seleccion', opciones: ENTIDADES.map(([valor, texto]) => ({ valor, texto })) }),
    h('button', { type: 'submit', class: 'boton boton-oscuro', text: 'Filtrar' }));
  filtros.addEventListener('submit', (e) => { e.preventDefault(); Object.assign(estado, leerFormulario(filtros), { pagina: 1 }); cargar().catch(anunciarError); });
  contenedor.append(encabezado(ctx.titulo, 'Registro de todos los cambios hechos en el panel. No se puede modificar.'), filtros, resultados);

  async function cargar() {
    const q = new URLSearchParams({ pagina: estado.pagina });
    if (estado.entidad) q.set('entidad', estado.entidad);
    const r = await obtener(`/api/admin/historial?${q}`);
    resultados.replaceChildren(tabla({
      titulo: 'Historial de cambios', vacio: 'Sin cambios registrados.', filas: r.registros,
      columnas: [
        { titulo: 'Fecha', valor: (x) => formatoFecha(x.fecha) },
        { titulo: 'Usuario', valor: (x) => x.usuario?.nombre ?? 'Sistema' },
        { titulo: 'Acción', valor: (x) => ACCIONES[x.accion] ?? x.accion },
        { titulo: 'Detalle', valor: (x) => x.resumen },
        { titulo: 'Cambios', clase: 'acciones', valor: (x) => (x.antes || x.despues ? h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Ver', 'aria-label': `Ver cambios: ${x.resumen}`, onClick: () => verCambio(x.id) }) : '—') },
      ],
    }), paginacion({ total: r.total, pagina: r.pagina, porPagina: r.porPagina, alCambiar: (p) => { estado.pagina = p; cargar().catch(anunciarError); } }));
  }
  await cargar();
}

const mostrarValor = (v) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v));

async function verCambio(id) {
  const x = await obtener(`/api/admin/historial/${id}`);
  const { cuerpo, pie, cerrar } = abrirDialogo({ titulo: x.resumen, tamano: 'ancho' });
  const antes = x.antes ?? {};
  const despues = x.despues ?? {};
  const claves = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((k) => !['actualizado', 'creado'].includes(k));
  const cambiadas = claves.filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]));
  cuerpo.append(h('p', { class: 'texto-suave', text: `${formatoFecha(x.fecha)} · ${x.usuario?.nombre ?? 'Sistema'}` }),
    tabla({
      titulo: 'Campos cambiados', vacio: 'No hay diferencias de campos para mostrar.', filas: cambiadas,
      columnas: [
        { titulo: 'Campo', valor: (k) => k },
        { titulo: 'Antes', valor: (k) => h('div', { class: 'json-cambio', text: mostrarValor(antes[k]) }) },
        { titulo: 'Después', valor: (k) => h('div', { class: 'json-cambio', text: mostrarValor(despues[k]) }) },
      ],
    }));
  pie.append(h('button', { type: 'button', class: 'boton boton-primario', text: 'Cerrar', onClick: () => cerrar() }));
}
