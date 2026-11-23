/**
 * Videos interactivos de Zenite.
 * - Se reproducen solo cuando el visitante toca "Reproducir" (sin autoplay):
 *   ahorra datos y respeta a quienes prefieren menos movimiento.
 * - Solo suena un video a la vez; se pausan al salir de la pantalla o al
 *   quedar fuera de vista en el carrusel.
 * - Mientras un video se reproduce, el carrusel no se arrastra sobre él para
 *   no interferir con la barra de controles.
 * @module videos
 */
import { crearCarrusel } from './carrusel.js';

const CLASE_SIN_ARRASTRE = 'swiper-no-swiping';

export async function iniciarVideos() {
  const seccion = document.getElementById('videos');
  if (!seccion) return;

  const tarjetas = [...seccion.querySelectorAll('[data-video]')];
  const videos = tarjetas.map((t) => t.querySelector('video'));
  const pausarTodos = (excepto = null) => videos.forEach((v) => { if (v !== excepto && !v.paused) v.pause(); });

  tarjetas.forEach((tarjeta) => prepararTarjeta(tarjeta, pausarTodos));

  if ('IntersectionObserver' in window) {
    const observador = new IntersectionObserver((entradas) => {
      entradas.forEach(({ target, isIntersecting }) => { if (!isIntersecting && !target.paused) target.pause(); });
    }, { threshold: 0.25 });
    videos.forEach((v) => observador.observe(v));
  }

  // El observador también pausa los videos que el carrusel deja fuera de vista.
  await crearCarrusel(seccion.querySelector('#videos-carrusel'), {
    controles: seccion.querySelector('#videos-controles'),
    paginacion: seccion.querySelector('#videos-paginacion'),
    item: 'video',
  });
}

function prepararTarjeta(tarjeta, pausarTodos) {
  const video = tarjeta.querySelector('video');
  const boton = tarjeta.querySelector('.video__reproducir');
  video.setAttribute('aria-label', tarjeta.querySelector('.video__titulo')?.textContent ?? 'Video');

  const activar = () => {
    video.controls = true;
    video.tabIndex = 0;
    video.classList.add(CLASE_SIN_ARRASTRE);
    tarjeta.classList.add('esta-activo');
    boton.hidden = true;
  };

  boton.addEventListener('click', async () => {
    activar();
    video.focus({ preventScroll: true }); // el teclado sigue en los controles del video
    try {
      await video.play();
    } catch (error) {
      // AbortError: otra acción pausó el video antes de empezar; no es una falla.
      if (error.name !== 'AbortError') console.error('El navegador no pudo reproducir el video.', error);
    }
  });

  video.addEventListener('play', () => pausarTodos(video));

  video.addEventListener('ended', () => {
    video.controls = false;
    video.removeAttribute('tabindex');
    video.classList.remove(CLASE_SIN_ARRASTRE);
    tarjeta.classList.remove('esta-activo');
    video.currentTime = 0;
    boton.hidden = false;
    boton.focus({ preventScroll: true });
  });
}
