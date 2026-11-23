/**
 * Animaciones de aparición con GSAP y ScrollTrigger.
 * - Cortas y suaves; se desactivan si el visitante prefiere reducir el movimiento.
 * - El contenido es visible sin JavaScript: GSAP solo anima desde un estado
 *   oculto los elementos que todavía no están en pantalla.
 * @module animaciones
 */
import { prefiereMenosMovimiento } from './utilidades.js';

export function iniciarAnimaciones() {
  const { gsap, ScrollTrigger } = window;
  if (!gsap || !ScrollTrigger || prefiereMenosMovimiento()) return;
  gsap.registerPlugin(ScrollTrigger);

  animarHero(gsap);
  revelarAlDesplazar(gsap);

  // Las secciones que cargan datos (portafolio) cambian la altura de la página.
  window.addEventListener('load', () => ScrollTrigger.refresh());
  document.addEventListener('zenite:contenido-cargado', () => ScrollTrigger.refresh());

  // Al saltar a una sección desde el pie o el menú, su contenido se muestra completo de inmediato.
  document.addEventListener('zenite:mostrar-seccion', ({ detail }) => terminarApariciones(gsap, detail.seccion));
}

function terminarApariciones(gsap, seccion) {
  if (!seccion) return;
  seccion.querySelectorAll('[data-revelar]').forEach((elemento) => {
    gsap.getTweensOf(elemento).forEach((tween) => {
      tween.scrollTrigger?.kill();
      tween.progress(1).kill();
    });
    gsap.set(elemento, { clearProps: 'transform,opacity' });
  });
}

function animarHero(gsap) {
  const elementos = document.querySelectorAll('[data-hero-entrada]');
  if (elementos.length === 0) return;
  gsap.from(elementos, {
    y: 28, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.12, delay: 0.1, clearProps: 'transform,opacity',
  });
  gsap.from('.hero__fondo', { scale: 1.08, duration: 2.4, ease: 'power2.out', clearProps: 'transform' });
}

function revelarAlDesplazar(gsap) {
  const limite = window.innerHeight * 0.9;
  gsap.utils.toArray('[data-revelar]').forEach((elemento) => {
    if (elemento.getBoundingClientRect().top < limite) return; // ya visible al cargar
    gsap.from(elemento, {
      y: 32,
      opacity: 0,
      duration: 0.8,
      ease: 'power2.out',
      clearProps: 'transform,opacity',
      scrollTrigger: { trigger: elemento, start: 'top 90%', once: true },
    });
  });
}
