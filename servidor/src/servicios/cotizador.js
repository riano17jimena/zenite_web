/**
 * Base de precios y cotizador.
 *
 * Público (sitio web): solo nombres, unidades y capítulos; nunca la base
 * completa ni los análisis de precios. Los valores aparecen únicamente en el
 * resultado de una cotización, calculada en el servidor.
 *
 * Panel (administradores): CRUD de capítulos, actividades (con su APU),
 * insumos, servicios de consultoría y financieros, y porcentajes AIU.
 * Al cambiar el precio de un insumo se recalculan las actividades que lo usan.
 * @module servicios/cotizador
 */
import { z } from 'zod';
import { ErrorApp, aNumero, invalido, noEncontrado } from '../errores.js';
import { CATEGORIAS } from '../dominio/categorias.js';
import { calcularCotizacion, ErrorCotizacion, UNIDADES } from '../dominio/cotizacion.js';
import { crearCalculadora } from '../dominio/precios.js';

const MAX_RESULTADOS_PUBLICOS = 30;

const numero = (msg, { min = 0, max = 1e12 } = {}) => z.preprocess((v) => (v === '' || v == null ? undefined : Number(String(v).replace(',', '.'))), z.number({ required_error: msg, invalid_type_error: msg }).min(min, msg).max(max, msg));
const numeroOpcional = (msg) => z.preprocess((v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.'))), z.number({ invalid_type_error: msg }).min(0, msg).nullable());
const texto = (min, max, msg) => z.string({ required_error: msg }).trim().min(min, msg).max(max, `Máximo ${max} caracteres.`);
const booleano = (d) => z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean().default(d));

const esquemaServicio = z.object({
  categoria: z.enum(['CONSULTORIA', 'FINANCIERA'], { errorMap: () => ({ message: 'Elige la pestaña del servicio.' }) }),
  nombre: texto(3, 120, 'Escribe el nombre del servicio.'),
  descripcion: texto(10, 400, 'Describe el servicio (mínimo 10 caracteres).'),
  unidad: z.enum(['M2', 'GLOBAL', 'MES', 'UNIDAD', 'HORA'], { errorMap: () => ({ message: 'Elige cómo se cobra.' }) }),
  precio: numero('Escribe el precio en pesos.'),
  cargoMinimo: numeroOpcional('El cargo mínimo debe ser un número.'),
  provisional: booleano(false),
  visible: booleano(true),
});

const esquemaConfiguracion = z.object({
  administracion: numero('Administración: escribe un porcentaje entre 0 y 100.', { max: 100 }),
  imprevistos: numero('Imprevistos: escribe un porcentaje entre 0 y 100.', { max: 100 }),
  utilidad: numero('Utilidad: escribe un porcentaje entre 0 y 100.', { max: 100 }),
  ivaSobreUtilidad: numero('IVA: escribe un porcentaje entre 0 y 100.', { max: 100 }),
  validezDias: numero('Escribe los días de validez.', { min: 1, max: 365 }).pipe(z.number().int()),
  correoDestino: z.string().trim().email('Escribe un correo válido.'),
  avisoReferencial: texto(20, 800, 'Escribe el aviso de valor referencial (mínimo 20 caracteres).'),
  condicionesPago: texto(10, 800, 'Escribe las condiciones de pago.'),
  datosPago: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(300).nullable()),
  maxLineas: numero('Escribe el máximo de ítems.', { min: 1, max: 200 }).pipe(z.number().int()),
});

const esquemaCapitulo = z.object({
  codigo: texto(1, 10, 'Escribe el código del capítulo.'),
  nombre: texto(3, 120, 'Escribe el nombre del capítulo.'),
  visiblePublico: booleano(true),
});

const esquemaActividad = z.object({
  codigo: texto(3, 20, 'Escribe el código (por ejemplo 3.15).').regex(/^\d+(\.\d+){1,2}$/, 'El código debe tener la forma 3.15 o 22.63.04.'),
  capituloId: numero('Elige el capítulo.', { min: 1 }).pipe(z.number().int()),
  subcapitulo: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(120).nullable().optional()),
  descripcion: texto(5, 400, 'Describe la actividad (mínimo 5 caracteres).'),
  unidad: texto(1, 20, 'Escribe la unidad (m2, m3, Un…).'),
  precioUnitario: numeroOpcional('El precio debe ser un número.').optional(),
  visiblePublico: booleano(true),
});

const esquemaComponente = z.object({
  grupo: z.enum(['MATERIALES', 'EQUIPO', 'MANO_OBRA', 'TRANSPORTE', 'SUBCONTRATO', 'OTROS', 'PERSONAL', 'SEGURIDAD_SOCIAL', 'PRESTACIONES', 'PARAFISCALES']),
  insumoId: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().positive().nullable()),
  descripcion: z.string().trim().max(300).optional(),
  unidad: z.string().trim().max(20).optional(),
  cantidad: numero('Escribe la cantidad o rendimiento.', { min: 0 }),
  precio: numeroOpcional('El precio debe ser un número.').optional(),
  porcentaje: booleano(false),
});

const esquemaInsumo = z.object({
  descripcion: texto(2, 300, 'Describe el insumo.'),
  unidad: texto(1, 20, 'Escribe la unidad.'),
  tipo: z.enum(['MATERIAL', 'EQUIPO', 'MANO_OBRA', 'TRANSPORTE', 'SUBCONTRATO', 'AUXILIAR', 'OTRO']),
  precio: numero('Escribe el precio en pesos.'),
  imagenId: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().positive().nullable()).optional(),
});

const claveInsumo = (descripcion, unidad) => `${descripcion}|${unidad}`.normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

const serializarServicio = (s, conPrecio) => ({
  id: s.id, categoria: s.categoria, nombre: s.nombre, descripcion: s.descripcion, unidad: s.unidad, unidadTexto: UNIDADES[s.unidad],
  ...(conPrecio ? { precio: aNumero(s.precio), cargoMinimo: aNumero(s.cargoMinimo), provisional: s.provisional, visible: s.visible, orden: s.orden } : {}),
});

const serializarConfiguracion = (c) => c && ({
  administracion: aNumero(c.administracion) * 100, imprevistos: aNumero(c.imprevistos) * 100, utilidad: aNumero(c.utilidad) * 100,
  ivaSobreUtilidad: aNumero(c.ivaSobreUtilidad) * 100, validezDias: c.validezDias, correoDestino: c.correoDestino,
  avisoReferencial: c.avisoReferencial, condicionesPago: c.condicionesPago, datosPago: c.datosPago, maxLineas: c.maxLineas,
});

const serializarActividad = (a) => ({
  id: a.id, codigo: a.codigo, capituloId: a.capituloId, capitulo: a.capitulo ? { codigo: a.capitulo.codigo, nombre: a.capitulo.nombre } : undefined,
  subcapitulo: a.subcapitulo, descripcion: a.descripcion, unidad: a.unidad, precioUnitario: aNumero(a.precioUnitario), visiblePublico: a.visiblePublico,
});

const serializarComponente = (c) => ({
  id: c.id, grupo: c.grupo, descripcion: c.descripcion, unidad: c.unidad, cantidad: aNumero(c.cantidad), precio: aNumero(c.precio),
  porcentaje: c.porcentaje, orden: c.orden, insumoId: c.insumoId,
  insumo: c.insumo ? { id: c.insumo.id, descripcion: c.insumo.descripcion, unidad: c.insumo.unidad, tipo: c.insumo.tipo, precio: aNumero(c.insumo.precio) } : null,
});

const serializarInsumo = (i) => ({
  id: i.id, descripcion: i.descripcion, unidad: i.unidad, tipo: i.tipo, precio: aNumero(i.precio), actualizado: i.actualizado,
  imagenId: i.imagenId ?? null,
  imagen: i.imagen ? { id: i.imagen.id, url: i.imagen.url, url960: i.imagen.variantes?.[960] ?? null, alt: i.imagen.alt } : null,
});


export function crearServicioCotizador({ db, historial }) {
  async function configuracion() {
    const c = await db.configuracionCotizador.findUnique({ where: { id: 1 } });
    if (!c) throw new ErrorApp(503, 'El cotizador no está configurado todavía.');
    return c;
  }

  /** Recalcula el precio de las actividades indicadas (o de todas) desde su APU. */
  async function recalcularActividades(idsActividad = null) {
    const insumos = await db.insumo.findMany({});
    const porId = new Map(insumos.map((i) => [i.id, { precio: aNumero(i.precio), tipo: i.tipo }]));
    const deAuxiliares = await db.componenteApu.findMany({ where: { auxiliarId: { not: null } } });
    const porAuxiliar = new Map();
    for (const c of deAuxiliares) {
      if (!porAuxiliar.has(c.auxiliarId)) porAuxiliar.set(c.auxiliarId, []);
      porAuxiliar.get(c.auxiliarId).push({ ...c, cantidad: aNumero(c.cantidad), precio: aNumero(c.precio) });
    }
    const calc = crearCalculadora({ obtenerInsumo: (id) => porId.get(id), componentesAuxiliar: (id) => porAuxiliar.get(id) });

    const where = { actividadId: idsActividad ? { in: idsActividad } : { not: null } };
    const componentes = await db.componenteApu.findMany({ where });
    const porActividad = new Map();
    for (const c of componentes) {
      if (!porActividad.has(c.actividadId)) porActividad.set(c.actividadId, []);
      porActividad.get(c.actividadId).push({ ...c, cantidad: aNumero(c.cantidad), precio: aNumero(c.precio) });
    }
    const actividades = await db.actividad.findMany({ where: { id: { in: [...porActividad.keys()] } } });
    let cambiadas = 0;
    for (const a of actividades) {
      const { total } = calc.sumar(porActividad.get(a.id));
      if (total !== aNumero(a.precioUnitario)) {
        await db.actividad.update({ where: { id: a.id }, data: { precioUnitario: total } });
        cambiadas += 1;
      }
    }
    // Precio de los auxiliares (se muestra en el panel como insumo).
    for (const [idAux] of porAuxiliar) {
      const precio = calc.precioInsumo(idAux);
      if (precio != null && precio !== porId.get(idAux)?.precio) await db.insumo.update({ where: { id: idAux }, data: { precio } });
    }
    return { revisadas: actividades.length, cambiadas };
  }

  /** Actividades afectadas por un insumo (directamente o a través de un auxiliar). */
  async function actividadesQueUsan(insumoId) {
    const auxiliares = new Set();
    const pendientes = [insumoId];
    while (pendientes.length) {
      const id = pendientes.pop();
      const usos = await db.componenteApu.findMany({ where: { insumoId: id, auxiliarId: { not: null } } });
      for (const u of usos) if (!auxiliares.has(u.auxiliarId)) { auxiliares.add(u.auxiliarId); pendientes.push(u.auxiliarId); }
    }
    const directos = await db.componenteApu.findMany({ where: { insumoId: { in: [insumoId, ...auxiliares] }, actividadId: { not: null } } });
    return [...new Set(directos.map((c) => c.actividadId))];
  }

  return {
    recalcularActividades,

    // ─── Público ─────────────────────────────────────────────────────────
    async opcionesPublicas() {
      const [capitulos, servicios, config] = await Promise.all([
        db.capitulo.findMany({ where: { visiblePublico: true }, orderBy: [{ orden: 'asc' }] }),
        db.servicioCatalogo.findMany({ where: { visible: true }, orderBy: [{ orden: 'asc' }, { id: 'asc' }] }),
        configuracion(),
      ]);
      return {
        tiposProyecto: CATEGORIAS.map((c) => ({ clave: c.clave, nombre: c.nombre })),
        capitulos: capitulos.map((c) => ({ codigo: c.codigo, nombre: c.nombre })),
        consultoria: servicios.filter((s) => s.categoria === 'CONSULTORIA').map((s) => serializarServicio(s, false)),
        financiera: servicios.filter((s) => s.categoria === 'FINANCIERA').map((s) => serializarServicio(s, false)),
        avisoReferencial: config.avisoReferencial,
        maxLineas: config.maxLineas,
      };
    },

    /** Búsqueda limitada: sin precios y máximo 30 resultados por consulta. */
    async buscarActividadesPublicas({ capitulo, buscar }) {
      const termino = String(buscar ?? '').trim();
      if (!capitulo && termino.length < 3) throw invalido('Elige un capítulo o escribe al menos 3 letras para buscar.');
      const filtros = [{ visiblePublico: true }, { capitulo: { is: { visiblePublico: true } } }];
      if (capitulo) filtros.push({ capitulo: { is: { codigo: String(capitulo) } } });
      for (const palabra of termino.split(/\s+/).filter((p) => p.length > 1).slice(0, 5)) {
        filtros.push({ descripcion: { contains: palabra, mode: 'insensitive' } });
      }
      const filas = await db.actividad.findMany({ where: { AND: filtros }, take: MAX_RESULTADOS_PUBLICOS + 1, orderBy: [{ id: 'asc' }] });
      return {
        actividades: filas.slice(0, MAX_RESULTADOS_PUBLICOS).map((a) => ({ codigo: a.codigo, descripcion: a.descripcion, unidad: a.unidad, subcapitulo: a.subcapitulo })),
        hayMas: filas.length > MAX_RESULTADOS_PUBLICOS,
      };
    },

    /** Calcula con los precios de la base. Lanza ErrorApp 400 con mensaje claro. */
    async calcular(seleccion) {
      const consultoria = seleccion.consultoria ?? [];
      const financiera = seleccion.financiera ?? [];
      const construccion = seleccion.construccion ?? [];
      const idsServicio = [...consultoria, ...financiera].map((s) => Number(s.id)).filter(Number.isInteger);
      const codigos = construccion.map((a) => String(a.codigo));
      const [config, servicios, actividades] = await Promise.all([
        configuracion(),
        idsServicio.length ? db.servicioCatalogo.findMany({ where: { id: { in: idsServicio }, visible: true } }) : [],
        codigos.length ? db.actividad.findMany({ where: { codigo: { in: codigos }, visiblePublico: true }, include: { capitulo: true } }) : [],
      ]);
      const mapaServicios = new Map(servicios.map((s) => [s.id, s]));
      const mapaActividades = new Map(actividades.filter((a) => a.capitulo?.visiblePublico !== false).map((a) => [a.codigo, a]));
      try {
        const resultado = calcularCotizacion({
          seleccion,
          buscarServicio: (id) => mapaServicios.get(id),
          buscarActividad: (codigo) => mapaActividades.get(codigo),
          parametros: {
            administracion: aNumero(config.administracion), imprevistos: aNumero(config.imprevistos), utilidad: aNumero(config.utilidad),
            ivaSobreUtilidad: aNumero(config.ivaSobreUtilidad), maxLineas: config.maxLineas,
          },
        });
        return { ...resultado, avisoReferencial: config.avisoReferencial, validezDias: config.validezDias };
      } catch (error) {
        if (error instanceof ErrorCotizacion) throw invalido(error.message);
        throw error;
      }
    },

    configuracion,

    // ─── Panel: servicios de consultoría y financieros ───────────────────
    async listarServicios() {
      const s = await db.servicioCatalogo.findMany({ orderBy: [{ categoria: 'asc' }, { orden: 'asc' }, { id: 'asc' }] });
      return s.map((x) => serializarServicio(x, true));
    },
    async crearServicio(datos, usuario) {
      const v = esquemaServicio.parse(datos);
      const ultimo = await db.servicioCatalogo.findFirst({ where: { categoria: v.categoria }, orderBy: { orden: 'desc' } });
      const s = await db.servicioCatalogo.create({ data: { ...v, orden: (ultimo?.orden ?? -1) + 1 } });
      await historial.registrar({ usuario, entidad: 'servicio', entidadId: s.id, accion: 'CREAR', resumen: `Creó el servicio «${s.nombre}»`, despues: serializarServicio(s, true) });
      return serializarServicio(s, true);
    },
    async actualizarServicio(id, datos, usuario) {
      const antes = await db.servicioCatalogo.findUnique({ where: { id: Number(id) } });
      if (!antes) throw noEncontrado('El servicio');
      const s = await db.servicioCatalogo.update({ where: { id: antes.id }, data: esquemaServicio.parse(datos) });
      await historial.registrar({ usuario, entidad: 'servicio', entidadId: s.id, accion: 'ACTUALIZAR', resumen: `Editó el servicio «${s.nombre}»`, antes: serializarServicio(antes, true), despues: serializarServicio(s, true) });
      return serializarServicio(s, true);
    },
    async eliminarServicio(id, usuario) {
      const antes = await db.servicioCatalogo.findUnique({ where: { id: Number(id) } });
      if (!antes) throw noEncontrado('El servicio');
      await db.servicioCatalogo.delete({ where: { id: antes.id } });
      await historial.registrar({ usuario, entidad: 'servicio', entidadId: antes.id, accion: 'ELIMINAR', resumen: `Eliminó el servicio «${antes.nombre}»`, antes: serializarServicio(antes, true) });
    },
    async ordenarServicios(ids, usuario) {
      const lista = z.array(z.coerce.number().int().positive()).parse(ids);
      for (const [orden, id] of lista.entries()) await db.servicioCatalogo.update({ where: { id }, data: { orden } });
      await historial.registrar({ usuario, entidad: 'servicio', accion: 'ORDENAR', resumen: 'Cambió el orden de los servicios', despues: lista });
    },

    // ─── Panel: configuración (AIU, correo, textos) ──────────────────────
    async obtenerConfiguracion() { return serializarConfiguracion(await configuracion()); },
    async actualizarConfiguracion(datos, usuario) {
      const v = esquemaConfiguracion.parse(datos);
      const antes = await configuracion();
      const data = { ...v, administracion: v.administracion / 100, imprevistos: v.imprevistos / 100, utilidad: v.utilidad / 100, ivaSobreUtilidad: v.ivaSobreUtilidad / 100 };
      const c = await db.configuracionCotizador.update({ where: { id: 1 }, data });
      await historial.registrar({ usuario, entidad: 'configuracion-cotizador', entidadId: 1, accion: 'ACTUALIZAR', resumen: 'Editó la configuración del cotizador', antes: serializarConfiguracion(antes), despues: serializarConfiguracion(c) });
      return serializarConfiguracion(c);
    },

    // ─── Panel: capítulos ────────────────────────────────────────────────
    async listarCapitulos() {
      const [caps, acts] = await Promise.all([db.capitulo.findMany({ orderBy: [{ orden: 'asc' }] }), db.actividad.findMany({})]);
      const conteo = acts.reduce((m, a) => m.set(a.capituloId, (m.get(a.capituloId) ?? 0) + 1), new Map());
      return caps.map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, orden: c.orden, visiblePublico: c.visiblePublico, actividades: conteo.get(c.id) ?? 0 }));
    },
    async crearCapitulo(datos, usuario) {
      const v = esquemaCapitulo.parse(datos);
      const c = await db.capitulo.create({ data: { ...v, orden: Number(v.codigo) || 999 } });
      await historial.registrar({ usuario, entidad: 'capitulo', entidadId: c.id, accion: 'CREAR', resumen: `Creó el capítulo ${c.codigo} ${c.nombre}`, despues: c });
      return c;
    },
    async actualizarCapitulo(id, datos, usuario) {
      const antes = await db.capitulo.findUnique({ where: { id: Number(id) } });
      if (!antes) throw noEncontrado('El capítulo');
      const c = await db.capitulo.update({ where: { id: antes.id }, data: esquemaCapitulo.parse(datos) });
      await historial.registrar({ usuario, entidad: 'capitulo', entidadId: c.id, accion: 'ACTUALIZAR', resumen: `Editó el capítulo ${c.codigo} ${c.nombre}`, antes, despues: c });
      return c;
    },
    async eliminarCapitulo(id, usuario) {
      const antes = await db.capitulo.findUnique({ where: { id: Number(id) } });
      if (!antes) throw noEncontrado('El capítulo');
      if (await db.actividad.count({ where: { capituloId: antes.id } })) throw new ErrorApp(409, 'El capítulo tiene actividades. Muévelas o elimínalas primero.');
      await db.capitulo.delete({ where: { id: antes.id } });
      await historial.registrar({ usuario, entidad: 'capitulo', entidadId: antes.id, accion: 'ELIMINAR', resumen: `Eliminó el capítulo ${antes.codigo} ${antes.nombre}`, antes });
    },

    // ─── Panel: actividades y su APU ─────────────────────────────────────
    async listarActividades({ buscar, capituloId, pagina = 1, porPagina = 25 } = {}) {
      const filtros = [];
      if (capituloId) filtros.push({ capituloId: Number(capituloId) });
      const termino = String(buscar ?? '').trim();
      if (/^\d+(\.\d+)*\.?$/.test(termino)) filtros.push({ codigo: { startsWith: termino } });
      else for (const p of termino.split(/\s+/).filter(Boolean).slice(0, 5)) filtros.push({ descripcion: { contains: p, mode: 'insensitive' } });
      const where = filtros.length ? { AND: filtros } : {};
      const [total, filas] = await Promise.all([
        db.actividad.count({ where }),
        db.actividad.findMany({ where, include: { capitulo: true }, orderBy: [{ id: 'asc' }], skip: (pagina - 1) * porPagina, take: porPagina }),
      ]);
      return { total, pagina, porPagina, actividades: filas.map(serializarActividad) };
    },
    obtenerActividad: (id) => obtenerConApu(id),
    async crearActividad(datos, usuario) {
      const v = esquemaActividad.parse(datos);
      const a = await db.actividad.create({ data: { ...v, precioUnitario: v.precioUnitario ?? 0 } });
      await historial.registrar({ usuario, entidad: 'actividad', entidadId: a.id, accion: 'CREAR', resumen: `Creó la actividad ${a.codigo}`, despues: serializarActividad(a) });
      return obtenerConApu(a.id);
    },
    async actualizarActividad(id, datos, usuario) {
      const antes = await db.actividad.findUnique({ where: { id: Number(id) } });
      if (!antes) throw noEncontrado('La actividad');
      const v = esquemaActividad.parse(datos);
      const tieneApu = await db.componenteApu.count({ where: { actividadId: antes.id } });
      // Con APU, el precio se calcula; sin APU, se escribe a mano.
      const data = { ...v, precioUnitario: tieneApu ? undefined : (v.precioUnitario ?? aNumero(antes.precioUnitario)) };
      const a = await db.actividad.update({ where: { id: antes.id }, data });
      await historial.registrar({ usuario, entidad: 'actividad', entidadId: a.id, accion: 'ACTUALIZAR', resumen: `Editó la actividad ${a.codigo}`, antes: serializarActividad(antes), despues: serializarActividad(a) });
      return obtenerConApu(a.id);
    },
    async eliminarActividad(id, usuario) {
      const antes = await db.actividad.findUnique({ where: { id: Number(id) } });
      if (!antes) throw noEncontrado('La actividad');
      await db.actividad.delete({ where: { id: antes.id } });
      await historial.registrar({ usuario, entidad: 'actividad', entidadId: antes.id, accion: 'ELIMINAR', resumen: `Eliminó la actividad ${antes.codigo}`, antes: serializarActividad(antes) });
    },
    /** Reemplaza el APU completo de una actividad y recalcula su precio. */
    async guardarComponentes(id, lista, usuario) {
      const actividad = await db.actividad.findUnique({ where: { id: Number(id) } });
      if (!actividad) throw noEncontrado('La actividad');
      const componentes = z.array(esquemaComponente).max(80, 'Máximo 80 componentes por actividad.').parse(lista);
      const antes = await obtenerConApu(actividad.id);
      const datos = [];
      for (const [orden, c] of componentes.entries()) {
        let { descripcion, unidad, precio } = c;
        if (c.insumoId) {
          const insumo = await db.insumo.findUnique({ where: { id: c.insumoId } });
          if (!insumo) throw invalido(`El insumo de la fila ${orden + 1} no existe.`);
          descripcion = insumo.descripcion; unidad = insumo.unidad; precio = aNumero(insumo.precio);
        } else if (!descripcion || precio == null) {
          throw invalido(`La fila ${orden + 1} necesita un insumo, o una descripción y un precio.`);
        }
        datos.push({ actividadId: actividad.id, grupo: c.grupo, insumoId: c.insumoId, descripcion, unidad: unidad ?? '', cantidad: c.cantidad, precio, porcentaje: c.porcentaje, orden });
      }
      await db.$transaction(async (tx) => {
        await tx.componenteApu.deleteMany({ where: { actividadId: actividad.id } });
        if (datos.length) await tx.componenteApu.createMany({ data: datos });
      });
      if (datos.length) await recalcularActividades([actividad.id]);
      const despues = await obtenerConApu(actividad.id);
      await historial.registrar({ usuario, entidad: 'actividad', entidadId: actividad.id, accion: 'ACTUALIZAR', resumen: `Editó el APU de la actividad ${actividad.codigo} (precio ${antes.precioUnitario} → ${despues.precioUnitario})`, antes, despues });
      return despues;
    },

    // ─── Panel: insumos (materiales, equipo, mano de obra…) ──────────────
    async listarInsumos({ buscar, tipo, pagina = 1, porPagina = 25 } = {}) {
      const filtros = [];
      if (tipo) filtros.push({ tipo });
      for (const p of String(buscar ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 5)) filtros.push({ descripcion: { contains: p, mode: 'insensitive' } });
      const where = filtros.length ? { AND: filtros } : {};
      const [total, filas] = await Promise.all([
        db.insumo.count({ where }),
        db.insumo.findMany({ where, orderBy: [{ descripcion: 'asc' }], skip: (pagina - 1) * porPagina, take: porPagina, include: { imagen: true } }),
      ]);
      return { total, pagina, porPagina, insumos: filas.map(serializarInsumo) };
    },
    async crearInsumo(datos, usuario) {
      const v = esquemaInsumo.parse(datos);
      const i = await db.insumo.create({ data: { ...v, clave: claveInsumo(v.descripcion, v.unidad) }, include: { imagen: true } });
      await historial.registrar({ usuario, entidad: 'insumo', entidadId: i.id, accion: 'CREAR', resumen: `Creó el insumo «${i.descripcion}»`, despues: serializarInsumo(i) });
      return serializarInsumo(i);
    },
    async actualizarInsumo(id, datos, usuario) {
      const antes = await db.insumo.findUnique({ where: { id: Number(id) }, include: { imagen: true } });
      if (!antes) throw noEncontrado('El insumo');
      const v = esquemaInsumo.parse(datos);
      const i = await db.insumo.update({ where: { id: antes.id }, data: { ...v, clave: claveInsumo(v.descripcion, v.unidad) }, include: { imagen: true } });
      let recalculo = { revisadas: 0, cambiadas: 0 };
      if (aNumero(antes.precio) !== aNumero(i.precio)) {
        // Actualiza el precio registrado en los APU que usan este insumo y recalcula.
        await db.componenteApu.updateMany({ where: { insumoId: i.id }, data: { precio: aNumero(i.precio), descripcion: i.descripcion, unidad: i.unidad } });
        const afectadas = await actividadesQueUsan(i.id);
        if (afectadas.length) recalculo = await recalcularActividades(afectadas);
      }
      await historial.registrar({ usuario, entidad: 'insumo', entidadId: i.id, accion: 'ACTUALIZAR', resumen: `Editó el insumo «${i.descripcion}»${recalculo.cambiadas ? ` y se recalcularon ${recalculo.cambiadas} actividades` : ''}`, antes: serializarInsumo(antes), despues: serializarInsumo(i) });
      return { ...serializarInsumo(i), recalculo };
    },
    async eliminarInsumo(id, usuario) {
      const antes = await db.insumo.findUnique({ where: { id: Number(id) } });
      if (!antes) throw noEncontrado('El insumo');
      const usos = await db.componenteApu.count({ where: { insumoId: antes.id } });
      if (usos) throw new ErrorApp(409, `No se puede eliminar: el insumo se usa en ${usos} análisis de precios. Reemplázalo primero.`);
      await db.insumo.delete({ where: { id: antes.id } });
      await historial.registrar({ usuario, entidad: 'insumo', entidadId: antes.id, accion: 'ELIMINAR', resumen: `Eliminó el insumo «${antes.descripcion}»`, antes: serializarInsumo(antes) });
    },
  };

  async function obtenerConApu(id) {
    const a = await db.actividad.findUnique({
      where: { id: Number(id) },
      include: { capitulo: true, componentes: { orderBy: [{ orden: 'asc' }, { id: 'asc' }], include: { insumo: true } } },
    });
    if (!a) throw noEncontrado('La actividad');
    return { ...serializarActividad(a), componentes: a.componentes.map(serializarComponente) };
  }
}
