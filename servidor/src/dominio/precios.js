/**
 * Cálculo de precios unitarios a partir del Análisis de Precios Unitarios (APU).
 *
 * Reglas (las mismas del Excel «Base de precios a todo costo»):
 * - Cada componente aporta cantidad × precio del insumo.
 * - Los insumos auxiliares (p. ej. «CUADRILLA 1 OF + 1 AY») tienen su propio
 *   análisis: su precio es la suma de sus componentes, redondeada al peso.
 * - Los componentes en porcentaje (unidad que empieza por «%») aportan
 *   cantidad/100 × base. Para «%MO» la base es el subtotal de mano de obra de la
 *   misma actividad; para los demás (prestaciones, aportes) se conserva la base
 *   registrada en el análisis.
 * - El precio de la actividad es la suma de todos los aportes, redondeada al peso.
 *
 * Módulo puro: no depende de la base de datos ni de Express.
 * @module dominio/precios
 */

/** Redondea a pesos enteros (el Excel trabaja sin centavos en los totales). */
export const redondearPeso = (valor) => Math.round(Number(valor) + Number.EPSILON);

/**
 * @typedef {Object} Componente
 * @property {string} grupo        MATERIALES, EQUIPO, MANO_OBRA, TRANSPORTE, ...
 * @property {string} unidad
 * @property {number} cantidad
 * @property {number} precio       Precio o base registrada en el análisis.
 * @property {boolean} porcentaje
 * @property {string|number|null} [insumoId]
 */

/**
 * Crea una calculadora con memoria para un conjunto de insumos y auxiliares.
 * @param {object} datos
 * @param {(id) => {precio:number, tipo:string}|undefined} datos.obtenerInsumo
 * @param {(id) => Componente[]|undefined} datos.componentesAuxiliar  Componentes si el insumo es auxiliar.
 */
export function crearCalculadora({ obtenerInsumo, componentesAuxiliar }) {
  const memoria = new Map();
  const enCurso = new Set();

  function precioInsumo(id) {
    if (memoria.has(id)) return memoria.get(id);
    const insumo = obtenerInsumo(id);
    if (!insumo) return null;
    const componentes = insumo.tipo === 'AUXILIAR' ? componentesAuxiliar(id) : null;
    let precio = Number(insumo.precio);
    if (componentes && componentes.length > 0) {
      if (enCurso.has(id)) throw new Error(`El insumo auxiliar ${id} se incluye a sí mismo en su análisis.`);
      enCurso.add(id);
      precio = sumar(componentes).total;
      enCurso.delete(id);
    }
    memoria.set(id, precio);
    return precio;
  }

  function precioComponente(c) {
    if (c.porcentaje) return Number(c.precio);
    if (c.insumoId == null) return Number(c.precio);
    const precio = precioInsumo(c.insumoId);
    return precio == null ? Number(c.precio) : precio;
  }

  /** Suma un análisis completo. Devuelve el total redondeado y los subtotales por grupo. */
  function sumar(componentes) {
    const grupos = {};
    // Primero los componentes que no son porcentaje sobre mano de obra.
    for (const c of componentes) {
      if (c.porcentaje && c.unidad === '%MO') continue;
      const aporte = c.porcentaje ? (Number(c.cantidad) / 100) * Number(c.precio) : Number(c.cantidad) * precioComponente(c);
      grupos[c.grupo] = (grupos[c.grupo] ?? 0) + aporte;
    }
    const manoDeObra = grupos.MANO_OBRA ?? 0;
    for (const c of componentes) {
      if (!(c.porcentaje && c.unidad === '%MO')) continue;
      grupos[c.grupo] = (grupos[c.grupo] ?? 0) + (Number(c.cantidad) / 100) * manoDeObra;
    }
    const total = redondearPeso(Object.values(grupos).reduce((a, b) => a + b, 0));
    return { total, grupos };
  }

  return { precioInsumo, sumar, olvidar: () => memoria.clear() };
}
