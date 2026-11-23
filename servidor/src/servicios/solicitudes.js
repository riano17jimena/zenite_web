/**
 * Solicitudes de contacto y cotizaciones del sitio público.
 *
 * Ley 1581 de 2012 (protección de datos personales):
 * - Solo se guardan los datos necesarios y la autorización expresa del titular,
 *   con la versión de la política aceptada y la fecha.
 * - La IP se guarda como huella (SHA-256), no en claro.
 * - Cada solicitud tiene fecha de eliminación; vencida, se anonimiza sola.
 * - Solo los administradores ven las solicitudes; pueden suprimirlas a pedido del titular.
 * @module servicios/solicitudes
 */
import { z } from 'zod';
import { ErrorApp, aNumero, noEncontrado } from '../errores.js';
import { CLAVES_CATEGORIA, nombreCategoria } from '../dominio/categorias.js';
import { formatearCOP } from '../dominio/cotizacion.js';
import { sha256 } from '../seguridad/criptografia.js';
import { generarDocumentoCotizacion } from './documento-cotizacion.js';

const telefono = z.string({ required_error: 'Escribe tu teléfono.' }).trim()
  .refine((v) => { const d = v.replace(/\D/g, '').length; return d >= 7 && d <= 15; }, 'Escribe un teléfono de 7 a 15 dígitos.');

const datosPersona = {
  nombre: z.string({ required_error: 'Escribe tu nombre.' }).trim().min(3, 'Escribe tu nombre (mínimo 3 letras).').max(80),
  correo: z.string({ required_error: 'Escribe tu correo.' }).trim().toLowerCase().email('Escribe un correo válido, por ejemplo nombre@correo.com.').max(120),
  telefono,
  consentimiento: z.literal(true, { errorMap: () => ({ message: 'Debes autorizar el tratamiento de tus datos para enviar la solicitud.' }) }),
};

export const esquemaContacto = z.object({
  ...datosPersona,
  tipoProyecto: z.enum([...CLAVES_CATEGORIA, 'otro'], { errorMap: () => ({ message: 'Elige el tipo de proyecto.' }) }),
  mensaje: z.string({ required_error: 'Cuéntanos sobre tu proyecto.' }).trim().min(10, 'Cuéntanos un poco sobre tu proyecto (mínimo 10 caracteres).').max(1500),
});

const item = z.object({ id: z.coerce.number().int().positive(), cantidad: z.coerce.number().positive().optional() });
export const esquemaSeleccion = z.object({
  tipoProyecto: z.enum(CLAVES_CATEGORIA).optional().nullable(),
  areaM2: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number({ invalid_type_error: 'El área debe ser un número.' }).positive('El área debe ser mayor que cero.').max(1_000_000).optional()),
  consultoria: z.array(item).max(60).default([]),
  construccion: z.array(z.object({ codigo: z.string().trim().regex(/^\d+(\.\d+){1,2}$/), cantidad: z.coerce.number() })).max(200).default([]),
  financiera: z.array(item).max(60).default([]),
});

export const esquemaSolicitudCotizacion = z.object({
  ...datosPersona,
  ciudad: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(80).optional()),
  mensaje: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(1500).optional()),
  seleccion: esquemaSeleccion,
});

const ESTADOS = ['NUEVA', 'EN_REVISION', 'CONTACTADA', 'CERRADA', 'DESCARTADA'];

const serializarSolicitud = (s) => ({
  id: s.id, nombre: s.nombre, correo: s.correo, telefono: s.telefono, tipoProyecto: s.tipoProyecto,
  tipoProyectoNombre: s.tipoProyecto ? nombreCategoria(s.tipoProyecto) : null, mensaje: s.mensaje, origen: s.origen,
  estado: s.estado, notas: s.notas, consentimiento: s.consentimiento, versionPolitica: s.versionPolitica,
  fechaConsentimiento: s.fechaConsentimiento, correoEnviado: s.correoEnviado, eliminarDespues: s.eliminarDespues,
  creada: s.creada, cotizacion: s.cotizacion ? { id: s.cotizacion.id, codigo: s.cotizacion.codigo, total: aNumero(s.cotizacion.total) } : null,
});

const serializarCotizacion = (c) => ({
  id: c.id, codigo: c.codigo, nombreCliente: c.nombreCliente, correoCliente: c.correoCliente, telefonoCliente: c.telefonoCliente,
  ciudad: c.ciudad, tipoProyecto: c.tipoProyecto, areaM2: aNumero(c.areaM2),
  subtotalConsultoria: aNumero(c.subtotalConsultoria), subtotalConstruccion: aNumero(c.subtotalConstruccion), subtotalFinanciera: aNumero(c.subtotalFinanciera),
  administracion: aNumero(c.administracion), imprevistos: aNumero(c.imprevistos), utilidad: aNumero(c.utilidad), ivaUtilidad: aNumero(c.ivaUtilidad),
  total: aNumero(c.total), enviadaEn: c.enviadaEn, errorEnvio: c.errorEnvio, creada: c.creada,
  lineas: (c.lineas ?? []).map((l) => ({ seccion: l.seccion, referencia: l.referencia, descripcion: l.descripcion, unidad: l.unidad, cantidad: aNumero(l.cantidad), precioUnitario: aNumero(l.precioUnitario), valor: aNumero(l.valor) })),
});

export function crearServicioSolicitudes({ db, config, correo, cotizador, historial }) {
  const fechaEliminacion = () => { const d = new Date(); d.setMonth(d.getMonth() + config.mesesRetencionSolicitudes); return d; };

  async function datosEmpresa() {
    const [contactos, perfil] = await Promise.all([
      db.datoContacto.findMany({ where: { visible: true }, orderBy: [{ orden: 'asc' }] }),
      db.perfil.findFirst({ where: { visible: true }, orderBy: [{ orden: 'asc' }] }),
    ]);
    const valor = (tipo) => contactos.find((c) => c.tipo === tipo)?.valor;
    return {
      representante: perfil ? `Arq. ${perfil.nombre}` : 'Arq. Daniel Camilo Brand Peña',
      telefono: valor('WHATSAPP') ?? valor('TELEFONO') ?? '315 711 0946',
      correo: valor('CORREO') ?? config.correoNotificaciones,
      direccion: valor('DIRECCION') ?? null,
      ciudad: 'Tunja',
      nit: '901.850.784-0',
    };
  }

  async function siguienteCodigo() {
    const anio = new Date().getFullYear();
    const prefijo = `ZEN-${anio}-`;
    const ultima = await db.cotizacion.findFirst({ where: { codigo: { startsWith: prefijo } }, orderBy: { codigo: 'desc' } });
    const n = ultima ? Number(ultima.codigo.slice(prefijo.length)) + 1 : 1;
    return `${prefijo}${String(n).padStart(4, '0')}`;
  }

  async function obtenerSolicitud(id) {
    const s = await db.solicitudContacto.findUnique({ where: { id: Number(id) }, include: { cotizacion: true } });
    if (!s) throw noEncontrado('La solicitud');
    return serializarSolicitud(s);
  }

  async function cotizacionCompleta(id) {
    return db.cotizacion.findUnique({ where: { id }, include: { lineas: { orderBy: [{ orden: 'asc' }] }, solicitud: true } });
  }

  async function enviarCotizacion(cotizacion) {
    const documento = await generarDocumentoCotizacion(cotizacion, await datosEmpresa());
    try {
      const destino = (await cotizador.configuracion()).correoDestino || config.correoNotificaciones;
      await correo.cotizacion(destino, { ...cotizacion, totalTexto: formatearCOP(cotizacion.total), descripcion: cotizacion.solicitud?.mensaje ?? '' }, documento);
      await db.cotizacion.update({ where: { id: cotizacion.id }, data: { enviadaEn: new Date(), errorEnvio: null } });
      return true;
    } catch (error) {
      console.error('No se pudo enviar la cotización por correo', error);
      await db.cotizacion.update({ where: { id: cotizacion.id }, data: { errorEnvio: String(error.message).slice(0, 300) } });
      return false;
    }
  }

  return {
    /** Formulario de contacto del sitio. */
    async crearDesdeFormulario(datos, { ip }) {
      const v = esquemaContacto.parse(datos);
      const solicitud = await db.solicitudContacto.create({
        data: {
          nombre: v.nombre, correo: v.correo, telefono: v.telefono, tipoProyecto: v.tipoProyecto === 'otro' ? null : v.tipoProyecto,
          mensaje: v.mensaje, origen: 'FORMULARIO', consentimiento: true, versionPolitica: config.versionPolitica,
          fechaConsentimiento: new Date(), ipHash: ip ? sha256(`${ip}|${config.secreto}`) : null, eliminarDespues: fechaEliminacion(),
        },
      });
      try {
        await correo.nuevaSolicitud(config.correoNotificaciones, { ...v, tipoProyecto: v.tipoProyecto === 'otro' ? 'Otro / no estoy seguro' : nombreCategoria(v.tipoProyecto) });
        await db.solicitudContacto.update({ where: { id: solicitud.id }, data: { correoEnviado: true } });
      } catch (error) {
        console.error('No se pudo enviar el aviso de nueva solicitud', error); // queda guardada en el panel
      }
      return { id: solicitud.id };
    },

    /** Cotización desde el simulador: se recalcula en el servidor, se guarda y se envía en Word. */
    async crearCotizacion(datos, { ip }) {
      const v = esquemaSolicitudCotizacion.parse(datos);
      const resultado = await cotizador.calcular(v.seleccion);
      const config2 = await cotizador.configuracion();
      const s = resultado.secciones;
      const lineas = [
        ...s.CONSULTORIA.lineas.map((l) => ({ ...l, seccion: 'CONSULTORIA' })),
        ...s.CONSTRUCCION.lineas.map((l) => ({ ...l, seccion: 'CONSTRUCCION' })),
        ...s.FINANCIERA.lineas.map((l) => ({ ...l, seccion: 'FINANCIERA' })),
      ];
      let cotizacion;
      for (let intento = 0; intento < 3 && !cotizacion; intento += 1) {
        try {
          cotizacion = await db.cotizacion.create({
            data: {
              codigo: await siguienteCodigo(), nombreCliente: v.nombre, correoCliente: v.correo, telefonoCliente: v.telefono,
              ciudad: v.ciudad ?? null, tipoProyecto: v.seleccion.tipoProyecto ?? null, areaM2: resultado.areaM2,
              subtotalConsultoria: s.CONSULTORIA.subtotal, subtotalConstruccion: s.CONSTRUCCION.subtotal, subtotalFinanciera: s.FINANCIERA.subtotal,
              administracion: s.CONSTRUCCION.aiu.administracion, imprevistos: s.CONSTRUCCION.aiu.imprevistos,
              utilidad: s.CONSTRUCCION.aiu.utilidad, ivaUtilidad: s.CONSTRUCCION.aiu.ivaUtilidad, total: resultado.total,
              parametros: { ...s.CONSTRUCCION.porcentajes, validezDias: config2.validezDias, avisoReferencial: config2.avisoReferencial, condicionesPago: config2.condicionesPago, datosPago: config2.datosPago },
            },
          });
        } catch (error) {
          if (error?.code !== 'P2002') throw error; // otro proceso tomó el mismo código: se reintenta
        }
      }
      if (!cotizacion) throw new ErrorApp(503, 'No pudimos registrar la cotización. Inténtalo de nuevo en un momento.');
      await db.cotizacionLinea.createMany({
        data: lineas.map((l, orden) => ({ cotizacionId: cotizacion.id, seccion: l.seccion, referencia: l.referencia, descripcion: l.descripcion, unidad: l.unidad, cantidad: l.cantidad, precioUnitario: l.precioUnitario, valor: l.valor, orden })),
      });
      const resumen = `Cotización ${cotizacion.codigo} desde el simulador. Total referencial ${formatearCOP(resultado.total)}.`;
      await db.solicitudContacto.create({
        data: {
          nombre: v.nombre, correo: v.correo, telefono: v.telefono, tipoProyecto: v.seleccion.tipoProyecto ?? null,
          mensaje: v.mensaje ? `${v.mensaje}\n\n${resumen}` : resumen, origen: 'COTIZADOR', consentimiento: true,
          versionPolitica: config.versionPolitica, fechaConsentimiento: new Date(), ipHash: ip ? sha256(`${ip}|${config.secreto}`) : null,
          cotizacionId: cotizacion.id, eliminarDespues: fechaEliminacion(), correoEnviado: false,
        },
      });
      const completa = await cotizacionCompleta(cotizacion.id);
      const enviada = await enviarCotizacion(completa);
      if (enviada) await db.solicitudContacto.updateMany({ where: { cotizacionId: cotizacion.id }, data: { correoEnviado: true } });
      return { codigo: cotizacion.codigo, total: resultado.total };
    },

    // ─── Panel ──────────────────────────────────────────────────────────
    async listar({ estado, buscar, pagina = 1, porPagina = 20 } = {}) {
      const filtros = [];
      if (estado && ESTADOS.includes(estado)) filtros.push({ estado });
      const termino = String(buscar ?? '').trim();
      if (termino) filtros.push({ OR: [{ nombre: { contains: termino, mode: 'insensitive' } }, { correo: { contains: termino, mode: 'insensitive' } }, { telefono: { contains: termino } }] });
      const where = filtros.length ? { AND: filtros } : {};
      const [total, filas, nuevas] = await Promise.all([
        db.solicitudContacto.count({ where }),
        db.solicitudContacto.findMany({ where, orderBy: [{ creada: 'desc' }, { id: 'desc' }], skip: (pagina - 1) * porPagina, take: porPagina, include: { cotizacion: true } }),
        db.solicitudContacto.count({ where: { estado: 'NUEVA' } }),
      ]);
      return { total, pagina, porPagina, nuevas, solicitudes: filas.map(serializarSolicitud) };
    },

    obtener: obtenerSolicitud,

    async actualizar(id, datos, usuario) {
      const v = z.object({ estado: z.enum(ESTADOS).optional(), notas: z.preprocess((x) => (x === '' ? null : x), z.string().trim().max(2000).nullable().optional()) }).parse(datos);
      const antes = await obtenerSolicitud(id);
      const s = await db.solicitudContacto.update({ where: { id: antes.id }, data: v, include: { cotizacion: true } });
      await historial.registrar({ usuario, entidad: 'solicitud', entidadId: s.id, accion: 'ACTUALIZAR', resumen: `Actualizó la solicitud de ${s.nombre}${v.estado ? ` (estado: ${v.estado})` : ''}`, antes: { estado: antes.estado, notas: antes.notas }, despues: { estado: s.estado, notas: s.notas } });
      return serializarSolicitud(s);
    },

    /** Supresión a solicitud del titular (Ley 1581). No guarda los datos en el historial. */
    async eliminar(id, usuario) {
      const s = await db.solicitudContacto.findUnique({ where: { id: Number(id) } });
      if (!s) throw noEncontrado('La solicitud');
      await db.solicitudContacto.delete({ where: { id: s.id } });
      if (s.cotizacionId) await db.cotizacion.delete({ where: { id: s.cotizacionId } }).catch(() => {});
      await historial.registrar({ usuario, entidad: 'solicitud', entidadId: s.id, accion: 'ELIMINAR', resumen: 'Eliminó una solicitud de contacto y sus datos personales' });
    },

    /** Anonimiza las solicitudes cuyo plazo de conservación venció. */
    async anonimizarVencidas() {
      const vencidas = await db.solicitudContacto.findMany({ where: { eliminarDespues: { lt: new Date() }, nombre: { not: 'Dato anonimizado' } } });
      for (const s of vencidas) {
        await db.solicitudContacto.update({ where: { id: s.id }, data: { nombre: 'Dato anonimizado', correo: 'anonimizado@zenite.invalid', telefono: '0000000', mensaje: '[Eliminado al cumplirse el plazo de conservación]', ipHash: null, notas: null } });
        if (s.cotizacionId) await db.cotizacion.update({ where: { id: s.cotizacionId }, data: { nombreCliente: 'Dato anonimizado', correoCliente: 'anonimizado@zenite.invalid', telefonoCliente: '0000000', ciudad: null } });
      }
      return vencidas.length;
    },

    async listarCotizaciones({ buscar, pagina = 1, porPagina = 20 } = {}) {
      const termino = String(buscar ?? '').trim();
      const where = termino ? { OR: [{ codigo: { contains: termino, mode: 'insensitive' } }, { nombreCliente: { contains: termino, mode: 'insensitive' } }] } : {};
      const [total, filas] = await Promise.all([
        db.cotizacion.count({ where }),
        db.cotizacion.findMany({ where, orderBy: [{ creada: 'desc' }], skip: (pagina - 1) * porPagina, take: porPagina }),
      ]);
      return { total, pagina, porPagina, cotizaciones: filas.map(serializarCotizacion) };
    },

    async obtenerCotizacion(id) {
      const c = await cotizacionCompleta(Number(id));
      if (!c) throw noEncontrado('La cotización');
      return serializarCotizacion(c);
    },

    async documentoCotizacion(id) {
      const c = await cotizacionCompleta(Number(id));
      if (!c) throw noEncontrado('La cotización');
      return { nombre: `${c.codigo}.docx`, contenido: await generarDocumentoCotizacion(c, await datosEmpresa()) };
    },

    async reenviarCotizacion(id, usuario) {
      const c = await cotizacionCompleta(Number(id));
      if (!c) throw noEncontrado('La cotización');
      const ok = await enviarCotizacion(c);
      await historial.registrar({ usuario, entidad: 'cotizacion', entidadId: c.id, accion: 'ACTUALIZAR', resumen: `Reenvió la cotización ${c.codigo}${ok ? '' : ' (falló el envío)'}` });
      if (!ok) throw new ErrorApp(502, 'No se pudo enviar el correo. Revisa la configuración de correo del servidor.');
    },
  };
}

