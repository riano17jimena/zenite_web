/**
 * Franja de proyectos que se desplaza sola a velocidad constante (marquesina).
 *
 * - El movimiento es una animación CSS lineal e infinita; este módulo duplica
 *   los elementos para que el ciclo no tenga cortes y calcula la duración a
 *   partir del ancho real, de modo que la velocidad (px/s) es siempre la misma.
 * - Accesibilidad (WCAG 2.2.2): se detiene al pasar el cursor, al enfocar un
 *   elemento con el teclado y con un botón visible "Pausar". Si el visitante
 *   prefiere reducir el movimiento, no se anima: queda como fila desplazable.
 * - La copia es solo visual: está oculta para lectores de pantalla y fuera del
 *   orden de tabulación, pero sigue respondiendo al clic.
 * @module marquesina
 */
import { prefiereMenosMovimiento } from './utilidades.js';

const VELOCIDAD_PX_S = 75;

/**
 * @param {HTMLElement} contenedor  Elemento .marquesina con .marquesina__pista y un .marquesina__grupo.
 * @param {{botonPausa?: HTMLButtonElement, velocidad?: number}} [config]
 * @returns {{pausar: (motivo: string) => void, reanudar: (motivo: string) => void} | null}
 */
export function crearMarquesina(contenedor, { botonPausa, velocidad = VELOCIDAD_PX_S } = {}) {
  const pista = contenedor.querySelector('.marquesina__pista');
  const grupo = pista?.querySelector('.marquesina__grupo');
  if (!pista || !grupo || grupo.children.length < 2 || prefiereMenosMovimiento()) return null;

  pista.querySelector('.marquesina__grupo--copia')?.remove();
  pista.append(crearCopia(grupo));

  const actualizarDuracion = () => {
    const ancho = grupo.getBoundingClientRect().width;
    if (ancho > 0) contenedor.style.setProperty('--marquesina-duracion', `${(ancho / velocidad).toFixed(2)}s`);
  };
  actualizarDuracion();
  new ResizeObserver(actualizarDuracion).observe(grupo);
  contenedor.classList.add('marquesina--activa');

  // Motivos de pausa independientes: el botón, un modal abierto, etc.
  const motivos = new Set();
  const aplicar = () => contenedor.classList.toggle('esta-pausada', motivos.size > 0);
  const control = {
    pausar(motivo) { motivos.add(motivo); aplicar(); },
    reanudar(motivo) { motivos.delete(motivo); aplicar(); },
  };

  if (botonPausa) {
    const texto = botonPausa.querySelector('.control-pausa__texto');
    botonPausa.hidden = false;
    botonPausa.setAttribute('aria-label', 'Pausar el movimiento del portafolio');
    botonPausa.addEventListener('click', () => {
      const pausado = !motivos.has('boton');
      if (pausado) control.pausar('boton'); else control.reanudar('boton');
      botonPausa.classList.toggle('esta-pausado', pausado);
      texto.textContent = pausado ? 'Reanudar' : 'Pausar';
      botonPausa.setAttribute('aria-label', pausado ? 'Reanudar el movimiento del portafolio' : 'Pausar el movimiento del portafolio');
    });
  }

  return control;
}

function crearCopia(grupo) {
  const copia = grupo.cloneNode(true);
  copia.classList.add('marquesina__grupo--copia');
  copia.setAttribute('aria-hidden', 'true');
  copia.removeAttribute('id');
  copia.removeAttribute('role');
  copia.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  copia.querySelectorAll('[aria-labelledby]').forEach((el) => el.removeAttribute('aria-labelledby'));
  copia.querySelectorAll('a, button, [tabindex]').forEach((el) => el.setAttribute('tabindex', '-1'));
  return copia;
}
