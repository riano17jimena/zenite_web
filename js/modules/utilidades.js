/**
 * Utilidades compartidas por los módulos de la interfaz.
 * @module utilidades
 */

/**
 * Crea un elemento del DOM sin usar innerHTML (evita inyección de código
 * cuando el contenido viene de archivos JSON editables).
 *
 * @param {string} etiqueta
 * @param {Record<string, string|number|boolean>} [atributos]
 * @param {(Node|string|null|undefined)[]} [hijos]
 * @returns {HTMLElement}
 */
export function crear(etiqueta, atributos = {}, hijos = []) {
  const el = document.createElement(etiqueta);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor === false || valor === null || valor === undefined) continue;
    if (nombre === 'clase') el.className = String(valor);
    else if (nombre === 'texto') el.textContent = String(valor);
    else el.setAttribute(nombre, valor === true ? '' : String(valor));
  }
  for (const hijo of hijos) {
    if (hijo === null || hijo === undefined) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

/**
 * Descarga y convierte un archivo JSON. Lanza un error descriptivo si falla.
 * @param {string|URL} url
 * @returns {Promise<any>}
 */
export async function cargarJSON(url) {
  const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!respuesta.ok) {
    throw new Error(`No se pudo cargar ${url} (HTTP ${respuesta.status}).`);
  }
  return respuesta.json();
}

/** @returns {boolean} true si el visitante pidió reducir el movimiento. */
export function prefiereMenosMovimiento() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Desplaza la vista hasta un elemento respetando la preferencia de movimiento.
 * @param {Element} elemento
 */
export function desplazarA(elemento) {
  elemento.scrollIntoView({ behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth', block: 'start' });
}
