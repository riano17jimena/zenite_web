/**
 * Contadores animados con cifras de la empresa (RF-09).
 * El número final está siempre en el HTML; la animación es un adorno que se
 * omite si el visitante prefiere menos movimiento.
 * @module contadores
 */
import { prefiereMenosMovimiento } from './utilidades.js';

const DURACION_MS = 1200;

export function iniciarContadores() {
  const elementos = [...document.querySelectorAll('[data-contador], [data-contador-desde]')];
  if (elementos.length === 0) return;

  // Los años de experiencia se calculan a partir del año de inicio (2015).
  elementos.forEach((el) => {
    if (el.dataset.contadorDesde) {
      const anios = new Date().getFullYear() - Number(el.dataset.contadorDesde);
      el.dataset.contador = String(anios);
      el.textContent = String(anios);
    }
  });

  if (prefiereMenosMovimiento() || !('IntersectionObserver' in window)) return;

  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      observador.unobserve(entrada.target);
      animar(entrada.target);
    });
  }, { threshold: 0.6 });

  elementos.forEach((el) => {
    // El lector de pantalla lee el valor final y no los números intermedios.
    const contenedor = el.closest('.contador__numero');
    if (contenedor) {
      const textoFinal = contenedor.textContent.trim();
      contenedor.setAttribute('aria-hidden', 'true');
      contenedor.insertAdjacentElement('afterend', Object.assign(document.createElement('span'), {
        className: 'visually-hidden',
        textContent: textoFinal,
      }));
    }
    observador.observe(el);
  });
}

function animar(el) {
  const objetivo = Number(el.dataset.contador);
  const inicio = performance.now();

  const paso = (ahora) => {
    const progreso = Math.min((ahora - inicio) / DURACION_MS, 1);
    const suavizado = 1 - (1 - progreso) ** 3;
    el.textContent = String(Math.round(objetivo * suavizado));
    if (progreso < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}
