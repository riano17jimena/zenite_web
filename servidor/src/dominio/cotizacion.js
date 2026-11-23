/**
 * Cálculo de una cotización referencial con tres secciones:
 * Análisis y consultoría, Construcción, y Financiera y costos.
 *
 * - Los precios SIEMPRE salen del catálogo del servidor; el navegador solo
 *   envía qué eligió y en qué cantidad.
 * - Construcción usa el precio unitario de cada actividad (APU) y suma
 *   Administración, Imprevistos y Utilidad (AIU) e IVA sobre la utilidad,
 *   igual que la hoja «COTIZADOR» del Excel.
 * - Consultoría y financiera: precio × cantidad, sin bajar del cargo mínimo.
 *   Si la unidad es m², la cantidad es el área del proyecto.
 *
 * Módulo puro (sin base de datos), probado en pruebas/cotizacion.test.js.
 * @module dominio/cotizacion
 */
import { redondearPeso } from './precios.js';

export const SECCIONES = Object.freeze({
  CONSULTORIA: 'Análisis y consultoría',
  CONSTRUCCION: 'Construcción',
  FINANCIERA: 'Financiera y costos',
});

export const UNIDADES = Object.freeze({ M2: 'm²', GLOBAL: 'Global', MES: 'Mes', UNIDAD: 'Unidad', HORA: 'Hora' });

const MAX_CANTIDAD = 1_000_000;

export class ErrorCotizacion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorCotizacion';
  }
}

function cantidadValida(valor, descripcion) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) throw new ErrorCotizacion(`Escribe una cantidad mayor que cero para «${descripcion}».`);
  if (n > MAX_CANTIDAD) throw new ErrorCotizacion(`La cantidad de «${descripcion}» es demasiado grande.`);
  return Math.round(n * 1000) / 1000;
}

function lineaServicio(seleccion, servicio, areaM2) {
  if (!servicio) throw new ErrorCotizacion('Uno de los servicios elegidos ya no está disponible. Vuelve a cargar la página.');
  let cantidad;
  if (servicio.unidad === 'M2') {
    if (!(Number(areaM2) > 0)) throw new ErrorCotizacion(`Escribe el área del proyecto en m² para calcular «${servicio.nombre}».`);
    cantidad = cantidadValida(areaM2, servicio.nombre);
  } else if (servicio.unidad === 'GLOBAL') {
    cantidad = 1;
  } else {
    cantidad = cantidadValida(seleccion.cantidad ?? 1, servicio.nombre);
  }
  const precio = Number(servicio.precio);
  const minimo = servicio.cargoMinimo == null ? 0 : Number(servicio.cargoMinimo);
  return {
    referencia: String(servicio.id),
    descripcion: servicio.nombre,
    unidad: UNIDADES[servicio.unidad] ?? servicio.unidad,
    cantidad,
    precioUnitario: precio,
    valor: redondearPeso(Math.max(precio * cantidad, minimo)),
    cargoMinimoAplicado: precio * cantidad < minimo,
  };
}

function lineaActividad(seleccion, actividad) {
  if (!actividad) throw new ErrorCotizacion('Una de las actividades elegidas ya no está disponible. Vuelve a cargar la página.');
  const cantidad = cantidadValida(seleccion.cantidad, actividad.descripcion);
  const precio = Number(actividad.precioUnitario);
  return {
    referencia: actividad.codigo,
    descripcion: actividad.descripcion,
    unidad: actividad.unidad,
    cantidad,
    precioUnitario: precio,
    valor: redondearPeso(precio * cantidad),
  };
}

const sumar = (lineas) => lineas.reduce((t, l) => t + l.valor, 0);

/**
 * @param {object} entrada
 * @param {{areaM2?:number, consultoria?:{id:number,cantidad?:number}[], construccion?:{codigo:string,cantidad:number}[], financiera?:{id:number,cantidad?:number}[]}} entrada.seleccion
 * @param {(id:number)=>object|undefined} entrada.buscarServicio  Servicio visible del catálogo.
 * @param {(codigo:string)=>object|undefined} entrada.buscarActividad  Actividad visible.
 * @param {{administracion:number, imprevistos:number, utilidad:number, ivaSobreUtilidad:number, maxLineas?:number}} entrada.parametros
 */
export function calcularCotizacion({ seleccion, buscarServicio, buscarActividad, parametros }) {
  const consultoria = seleccion.consultoria ?? [];
  const construccion = seleccion.construccion ?? [];
  const financiera = seleccion.financiera ?? [];
  const totalLineas = consultoria.length + construccion.length + financiera.length;
  if (totalLineas === 0) throw new ErrorCotizacion('Elige al menos un servicio o una actividad para calcular la cotización.');
  if (totalLineas > (parametros.maxLineas ?? 60)) throw new ErrorCotizacion(`Puedes incluir hasta ${parametros.maxLineas ?? 60} ítems por cotización.`);

  const repetidos = (lista, clave) => new Set(lista.map((x) => String(x[clave]))).size !== lista.length;
  if (repetidos(consultoria, 'id') || repetidos(financiera, 'id') || repetidos(construccion, 'codigo')) {
    throw new ErrorCotizacion('Hay ítems repetidos en la cotización; ajusta la cantidad en lugar de agregarlos dos veces.');
  }

  const servicioDe = (categoria) => (s) => {
    const servicio = buscarServicio(Number(s.id));
    if (servicio && servicio.categoria !== categoria) throw new ErrorCotizacion('Uno de los servicios no corresponde a su pestaña.');
    return lineaServicio(s, servicio, seleccion.areaM2);
  };
  const lineasConsultoria = consultoria.map(servicioDe('CONSULTORIA'));
  const lineasFinanciera = financiera.map(servicioDe('FINANCIERA'));
  const lineasConstruccion = construccion.map((a) => lineaActividad(a, buscarActividad(String(a.codigo))));

  const directoConstruccion = sumar(lineasConstruccion);
  const administracion = redondearPeso(directoConstruccion * Number(parametros.administracion));
  const imprevistos = redondearPeso(directoConstruccion * Number(parametros.imprevistos));
  const utilidad = redondearPeso(directoConstruccion * Number(parametros.utilidad));
  const ivaUtilidad = redondearPeso(utilidad * Number(parametros.ivaSobreUtilidad));
  const totalConstruccion = directoConstruccion + administracion + imprevistos + utilidad + ivaUtilidad;

  const subtotalConsultoria = sumar(lineasConsultoria);
  const subtotalFinanciera = sumar(lineasFinanciera);

  return {
    areaM2: seleccion.areaM2 ? Number(seleccion.areaM2) : null,
    secciones: {
      CONSULTORIA: { nombre: SECCIONES.CONSULTORIA, lineas: lineasConsultoria, subtotal: subtotalConsultoria },
      CONSTRUCCION: {
        nombre: SECCIONES.CONSTRUCCION,
        lineas: lineasConstruccion,
        subtotal: directoConstruccion,
        aiu: { administracion, imprevistos, utilidad, ivaUtilidad },
        porcentajes: {
          administracion: Number(parametros.administracion),
          imprevistos: Number(parametros.imprevistos),
          utilidad: Number(parametros.utilidad),
          ivaSobreUtilidad: Number(parametros.ivaSobreUtilidad),
        },
        total: totalConstruccion,
      },
      FINANCIERA: { nombre: SECCIONES.FINANCIERA, lineas: lineasFinanciera, subtotal: subtotalFinanciera },
    },
    total: subtotalConsultoria + totalConstruccion + subtotalFinanciera,
  };
}

const formatoPesos = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
export const formatearCOP = (valor) => `$ ${formatoPesos.format(Math.round(Number(valor)))}`;

/** Total en letras para el documento («Son: ... PESOS M/CTE»). */
export function numeroEnLetras(valor) {
  const n = Math.round(Number(valor));
  if (n === 0) return 'CERO';
  const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  const decenas = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  const menorMil = (x) => {
    if (x === 0) return '';
    if (x === 100) return 'CIEN';
    const c = Math.floor(x / 100); const r = x % 100;
    let texto = centenas[c];
    if (r > 0) {
      const parte = r < 30 ? unidades[r] : decenas[Math.floor(r / 10)] + (r % 10 ? ` Y ${unidades[r % 10]}` : '');
      texto = texto ? `${texto} ${parte}` : parte;
    }
    return texto;
  };
  const bloques = [];
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  if (millones) {
    if (millones >= 1_000_000) return formatoPesos.format(n); // fuera de alcance práctico
    bloques.push(millones === 1 ? 'UN MILLÓN' : `${numeroEnLetras(millones).replace(/UNO$/, 'UN')} MILLONES`);
  }
  if (miles) bloques.push(miles === 1 ? 'MIL' : `${menorMil(miles).replace(/UNO$/, 'UN')} MIL`);
  if (resto) bloques.push(menorMil(resto));
  let texto = bloques.join(' ');
  if (millones && !miles && !resto) texto += ' DE';
  return texto;
}
