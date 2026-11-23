/**
 * Genera la cotización en Word (.docx) con el formato de la plantilla de Zenite
 * (membrete, saludo, alcance, propuesta económica por secciones, condiciones,
 * datos de contacto y bloque de aceptación). Usa la librería «docx».
 *
 * El documento se marca como borrador generado desde el sitio web: el
 * arquitecto lo revisa, lo ajusta y lo firma antes de enviarlo al cliente.
 * @module servicios/documento-cotizacion
 */
import { readFile } from 'node:fs/promises';
import {
  AlignmentType, BorderStyle, Document, Header, HorizontalPositionRelativeFrom, ImageRun, Packer,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, TextWrappingType, VerticalPositionRelativeFrom, WidthType,
} from 'docx';
import { formatearCOP, numeroEnLetras } from '../dominio/cotizacion.js';
import { nombreCategoria } from '../dominio/categorias.js';

const RUTA_MEMBRETE = new URL('../plantillas/membrete.jpg', import.meta.url);
const FUENTE = 'Calibri';
const AZUL = '0B2A45';
const GRIS_TITULO = 'D9D9D9';
const GRIS_FILA = 'F2F2F2';
let membrete = null;

const formatoCantidad = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const fechaLarga = (fecha) => fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' });
const porcentaje = (v) => `${(Number(v) * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 })} %`;

const t = (texto, opciones = {}) => new TextRun({ text: String(texto ?? ''), font: FUENTE, size: opciones.size ?? 20, ...opciones });
const parrafo = (hijos, opciones = {}) => new Paragraph({ children: [].concat(hijos).map((h) => (typeof h === 'string' ? t(h) : h)), spacing: { after: 140, line: 276 }, ...opciones });
const titulo = (texto) => parrafo(t(texto, { bold: true, size: 22, color: AZUL }), { spacing: { before: 240, after: 120 } });
const vineta = (texto) => parrafo(t(texto), { bullet: { level: 0 }, spacing: { after: 60 } });

const bordes = { top: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }, left: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }, right: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' } };

function celda(texto, { ancho, negrita = false, alinear = AlignmentType.LEFT, relleno, columnas } = {}) {
  return new TableCell({
    width: ancho ? { size: ancho, type: WidthType.DXA } : undefined,
    columnSpan: columnas,
    borders: bordes,
    shading: relleno ? { type: ShadingType.CLEAR, color: 'auto', fill: relleno } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ alignment: alinear, children: [t(texto, { bold: negrita, size: 18 })] })],
  });
}

/** Tabla de una sección: Ítem, Descripción, Unidad, Cantidad, Vr. unitario, Valor. */
function tablaSeccion(lineas, { prefijo, subtotalTexto, subtotal }) {
  const anchos = [700, 3838, 800, 1000, 1200, 1300];
  const encabezado = new TableRow({ cantSplit: true,
    tableHeader: true,
    children: ['Ítem', 'Descripción', 'Unidad', 'Cantidad', 'Vr. unitario referencial', 'Valor'].map((h, i) => celda(h, { ancho: anchos[i], negrita: true, relleno: GRIS_TITULO, alinear: i >= 3 ? AlignmentType.RIGHT : AlignmentType.LEFT })),
  });
  const filas = lineas.map((l, i) => new TableRow({ cantSplit: true,
    children: [
      celda(`${prefijo}.${i + 1}`, { ancho: anchos[0] }),
      celda(l.referencia && /^\d/.test(l.referencia) ? `${l.descripcion} (código ${l.referencia})` : l.descripcion, { ancho: anchos[1] }),
      celda(l.unidad, { ancho: anchos[2] }),
      celda(formatoCantidad.format(Number(l.cantidad)), { ancho: anchos[3], alinear: AlignmentType.RIGHT }),
      celda(formatearCOP(l.precioUnitario), { ancho: anchos[4], alinear: AlignmentType.RIGHT }),
      celda(formatearCOP(l.valor), { ancho: anchos[5], alinear: AlignmentType.RIGHT }),
    ],
  }));
  const pie = new TableRow({ cantSplit: true,
    children: [celda(subtotalTexto, { columnas: 5, negrita: true, relleno: GRIS_FILA }), celda(formatearCOP(subtotal), { negrita: true, relleno: GRIS_FILA, alinear: AlignmentType.RIGHT })],
  });
  return new Table({ width: { size: 8838, type: WidthType.DXA }, columnWidths: anchos, rows: [encabezado, ...filas, pie] });
}

function tablaResumen(filas) {
  return new Table({
    width: { size: 8838, type: WidthType.DXA },
    columnWidths: [6138, 2700],
    rows: [
      new TableRow({ cantSplit: true, tableHeader: true, children: [celda('Concepto', { negrita: true, relleno: GRIS_TITULO }), celda('Valor', { negrita: true, relleno: GRIS_TITULO, alinear: AlignmentType.RIGHT })] }),
      ...filas.map(([concepto, valor, destacado]) => new TableRow({ cantSplit: true,
        children: [celda(concepto, { negrita: destacado, relleno: destacado ? GRIS_FILA : undefined }), celda(formatearCOP(valor), { negrita: destacado, relleno: destacado ? GRIS_FILA : undefined, alinear: AlignmentType.RIGHT })],
      })),
    ],
  });
}

/**
 * @param {object} cotizacion  Registro guardado (con lineas y parametros).
 * @param {object} empresa     Datos de contacto: { representante, telefono, correo, direccion, ciudad, nit }.
 * @returns {Promise<Buffer>}
 */
export async function generarDocumentoCotizacion(cotizacion, empresa) {
  membrete ??= await readFile(RUTA_MEMBRETE).catch(() => null);
  const p = cotizacion.parametros ?? {};
  const lineas = (seccion) => cotizacion.lineas.filter((l) => l.seccion === seccion).sort((a, b) => a.orden - b.orden);
  const consultoria = lineas('CONSULTORIA');
  const construccion = lineas('CONSTRUCCION');
  const financiera = lineas('FINANCIERA');
  const n = (v) => Number(v ?? 0);
  const totalConstruccion = n(cotizacion.subtotalConstruccion) + n(cotizacion.administracion) + n(cotizacion.imprevistos) + n(cotizacion.utilidad) + n(cotizacion.ivaUtilidad);
  const tipo = cotizacion.tipoProyecto ? nombreCategoria(cotizacion.tipoProyecto) : null;

  const secciones = [];
  let numero = 1;
  const contenido = [
    parrafo(t('BORRADOR GENERADO DESDE EL SITIO WEB · Revisar, ajustar y firmar antes de enviar al cliente', { size: 16, color: '8A5A00', bold: true }), { alignment: AlignmentType.RIGHT }),
    parrafo(`${empresa.ciudad ?? 'Tunja'}, ${fechaLarga(new Date(cotizacion.creada))}`),
    parrafo([t('Cotización N.º ', { bold: true }), t(cotizacion.codigo)]),
    parrafo([t('A la atención de: ', { bold: true }), t(cotizacion.nombreCliente)]),
    parrafo([t('ASUNTO: ', { bold: true }), t(`Propuesta técnica y económica referencial${tipo ? ` para un proyecto ${tipo.toLowerCase()}` : ''}${cotizacion.ciudad ? ` en ${cotizacion.ciudad}` : ''}.`)]),
    parrafo('Estimado(a) cliente,'),
    parrafo(`Atendiendo su solicitud realizada en nuestro sitio web, presentamos a su consideración la siguiente propuesta referencial, construida con los servicios y actividades que usted seleccionó${cotizacion.areaM2 ? ` para un área aproximada de ${formatoCantidad.format(n(cotizacion.areaM2))} m²` : ''}. Los valores son una estimación inicial y se ajustarán después de conocer el proyecto y verificar las condiciones en sitio.`),
    titulo(`${numero++}. Alcance de la propuesta`),
    ...(consultoria.length ? [parrafo(t('Análisis y consultoría:', { bold: true })), ...consultoria.map((l) => vineta(l.descripcion))] : []),
    ...(construccion.length ? [parrafo(t('Construcción:', { bold: true })), vineta(`${construccion.length} ${construccion.length === 1 ? 'actividad de obra' : 'actividades de obra'} con sus cantidades estimadas, valoradas con análisis de precios unitarios (materiales, equipo, mano de obra y transporte).`)] : []),
    ...(financiera.length ? [parrafo(t('Financiera y costos:', { bold: true })), ...financiera.map((l) => vineta(l.descripcion))] : []),
    titulo(`${numero}. Propuesta económica`),
    parrafo('La propuesta se discrimina a continuación por secciones. Los valores unitarios son referenciales y están expresados en pesos colombianos.'),
  ];

  let sub = 1;
  if (consultoria.length) {
    contenido.push(parrafo(t(`${numero}.${sub} Análisis y consultoría`, { bold: true })), tablaSeccion(consultoria, { prefijo: sub, subtotalTexto: 'Subtotal análisis y consultoría', subtotal: cotizacion.subtotalConsultoria }), parrafo(''));
    secciones.push(['Análisis y consultoría', n(cotizacion.subtotalConsultoria)]);
    sub += 1;
  }
  if (construccion.length) {
    contenido.push(parrafo(t(`${numero}.${sub} Construcción (costo directo)`, { bold: true })), tablaSeccion(construccion, { prefijo: sub, subtotalTexto: 'Costo directo de construcción', subtotal: cotizacion.subtotalConstruccion }), parrafo(''));
    secciones.push(['Construcción · costo directo', n(cotizacion.subtotalConstruccion)],
      [`Administración ${porcentaje(p.administracion)}`, n(cotizacion.administracion)],
      [`Imprevistos ${porcentaje(p.imprevistos)}`, n(cotizacion.imprevistos)],
      [`Utilidad ${porcentaje(p.utilidad)}`, n(cotizacion.utilidad)],
      [`IVA sobre la utilidad ${porcentaje(p.ivaSobreUtilidad)}`, n(cotizacion.ivaUtilidad)],
      ['Total construcción', totalConstruccion, true]);
    sub += 1;
  }
  if (financiera.length) {
    contenido.push(parrafo(t(`${numero}.${sub} Financiera y costos`, { bold: true })), tablaSeccion(financiera, { prefijo: sub, subtotalTexto: 'Subtotal financiera y costos', subtotal: cotizacion.subtotalFinanciera }), parrafo(''));
    secciones.push(['Financiera y costos', n(cotizacion.subtotalFinanciera)]);
    sub += 1;
  }
  contenido.push(
    parrafo(t(`${numero}.${sub} Resumen general del valor ofertado`, { bold: true })),
    tablaResumen([...secciones, ['VALOR TOTAL OFERTADO (REFERENCIAL)', n(cotizacion.total), true]]),
    parrafo(''),
    parrafo([t('Son: ', { bold: true }), t(`${numeroEnLetras(cotizacion.total)} PESOS M/CTE (${formatearCOP(cotizacion.total)}).`)]),
  );
  if (p.datosPago) contenido.push(parrafo(p.datosPago));
  numero += 1;

  contenido.push(
    titulo(`${numero++}. Condiciones comerciales`),
    vineta(`Validez de la oferta: ${p.validezDias ?? 15} días calendario.`),
    vineta(`Forma de pago: ${p.condicionesPago ?? 'por definir con el cliente.'}`),
    vineta('Tiempo de ejecución: [___] días calendario a partir de la firma de aceptación.'),
    vineta('Base de cantidades: las cantidades son estimadas por el cliente y podrán ajustarse con las medidas y diseños definitivos.'),
    titulo(`${numero++}. Nota sobre el valor referencial`),
    parrafo(p.avisoReferencial ?? 'Este valor es una estimación y no constituye una oferta contractual.'),
    parrafo('Agradecemos su interés en Zenite Arquitectura. Quedamos a su disposición para atender inquietudes, realizar las aclaraciones técnicas necesarias y coordinar una visita.'),
    parrafo('Atentamente,'),
    parrafo(t('ZENITE ARQUITECTURA S.A.S', { bold: true })),
    parrafo(`Representante: ${empresa.representante}`),
    parrafo(`Teléfono: ${empresa.telefono}`),
    parrafo(`Correo electrónico: ${empresa.correo}`),
    ...(empresa.direccion ? [parrafo(`Dirección: ${empresa.direccion}`)] : []),
    titulo('Aceptación de la propuesta'),
    parrafo('Al aceptar esta propuesta, el cliente y ZENITE ARQUITECTURA S.A.S se comprometen a iniciar la etapa contractual bajo las condiciones y valores aquí establecidos, sujetos a ajustes finales.'),
    parrafo(t('Cliente:', { bold: true })),
    parrafo(`Nombre: ${cotizacion.nombreCliente}`),
    parrafo(`Correo: ${cotizacion.correoCliente} · Teléfono: ${cotizacion.telefonoCliente}`),
    parrafo('Firma: ____________________________________'),
    parrafo('C.C. / NIT: ____________________________________'),
    parrafo(t('ZENITE ARQUITECTURA S.A.S:', { bold: true })),
    parrafo(`Nombre: ${empresa.representante}`),
    parrafo('Firma: ____________________________________'),
    ...(empresa.nit ? [parrafo(`NIT: ${empresa.nit}`)] : []),
  );

  const encabezado = membrete
    ? new Header({
      children: [new Paragraph({
        children: [new ImageRun({
          type: 'jpg',
          data: membrete,
          transformation: { width: 816, height: 1056 },
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
            behindDocument: true,
            allowOverlap: true,
            wrap: { type: TextWrappingType.NONE },
          },
          altText: { title: 'Membrete', description: 'Membrete de Zenite Arquitectura S.A.S.', name: 'membrete' },
        })],
      })],
    })
    : undefined;

  const documento = new Document({
    creator: 'Zenite Web',
    title: `Cotización ${cotizacion.codigo}`,
    description: 'Cotización referencial generada desde el sitio web de Zenite Arquitectura',
    styles: { default: { document: { run: { font: FUENTE, size: 20 } } } },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 2300, right: 1701, bottom: 1500, left: 1701, header: 708, footer: 400 } } },
      headers: encabezado ? { default: encabezado } : undefined,
      children: contenido,
    }],
  });
  return Packer.toBuffer(documento);
}
