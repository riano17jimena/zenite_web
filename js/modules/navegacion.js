/**
 * Navegación del sitio (RF-02).
 * - Encabezado transparente sobre el hero que se vuelve sólido al hacer scroll.
 * - Menú lateral (offcanvas de Bootstrap) accesible: Escape lo cierra, el foco
 *   vuelve al botón "Menú" y, al elegir una sección, el foco pasa a su título.
 * - Los enlaces del pie y del menú saltan directo a la sección y la muestran
 *   completa (sin esperar las animaciones de aparición).
 * - Marca la sección visible con aria-current y actualiza el año del pie.
 * @module navegacion
 */

const UMBRAL_SCROLL = 40;

export function iniciarNavegacion() {
  mostrarInicioDePagina();
  iniciarEncabezado();
  iniciarPanel();
  iniciarEnlacesPie();
  iniciarSeccionActiva();

  document.querySelectorAll('[data-anio]').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });
}

function iniciarEncabezado() {
  const encabezado = document.querySelector('[data-encabezado]');
  if (!encabezado?.classList.contains('encabezado--superpuesto')) return;

  let pendiente = false;
  const actualizar = () => {
    encabezado.classList.toggle('es-solido', window.scrollY > UMBRAL_SCROLL);
    pendiente = false;
  };
  actualizar();
  window.addEventListener('scroll', () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(actualizar);
  }, { passive: true });
}

function iniciarPanel() {
  const panel = document.getElementById('panel-menu');
  const boton = document.querySelector('[data-bs-target="#panel-menu"]');
  const Offcanvas = window.bootstrap?.Offcanvas;
  if (!panel || !boton || !Offcanvas) return;

  const instancia = Offcanvas.getOrCreateInstance(panel);
  let seccionDestino = null;

  panel.addEventListener('show.bs.offcanvas', () => boton.setAttribute('aria-expanded', 'true'));
  panel.addEventListener('hidden.bs.offcanvas', () => {
    boton.setAttribute('aria-expanded', 'false');
    if (seccionDestino) {
      // Bootstrap devuelve el foco al botón después de este evento; se espera
      // un ciclo para dejar el foco en el título de la sección elegida.
      const seccion = seccionDestino;
      seccionDestino = null;
      setTimeout(() => irASeccion(seccion), 0);
    } else {
      boton.focus(); // Cerrar con Escape o con "Cerrar" devuelve el foco al botón.
    }
  });

  panel.addEventListener('click', (evento) => {
    const enlace = evento.target.closest('[data-menu-enlace]');
    const seccion = enlace && seccionDeEstaPagina(enlace);
    if (!seccion) return; // Enlace a otra página: navegación normal.
    evento.preventDefault();
    seccionDestino = seccion;
    instancia.hide();
  });
}

/**
 * Enlaces del pie de página. Si la sección está en esta misma página, se salta
 * directo a ella; si está en otra (por ejemplo, desde una página de servicio),
 * el navegador abre la página principal y reubicarSeccionInicial() la ubica.
 */
function iniciarEnlacesPie() {
  document.querySelector('footer.pie')?.addEventListener('click', (evento) => {
    const enlace = evento.target.closest('a[href*="#"]');
    const seccion = enlace && seccionDeEstaPagina(enlace);
    if (!seccion) return;
    evento.preventDefault();
    irASeccion(seccion);
  });
}

/** Devuelve la sección a la que apunta el enlace si está en esta página. */
function seccionDeEstaPagina(enlace) {
  const url = new URL(enlace.href, window.location.href);
  if (!url.hash || url.pathname !== window.location.pathname) return null;
  return document.getElementById(decodeURIComponent(url.hash.slice(1)));
}

/**
 * Lleva la vista a la sección de inmediato (sin desplazamiento animado),
 * muestra su contenido completo y pone el foco en su título.
 */
export function irASeccion(seccion) {
  mostrarSeccion(seccion);
  desplazarSinAnimacion(seccion);
  const titulo = seccion.querySelector('h1, h2') ?? seccion;
  if (!titulo.hasAttribute('tabindex')) titulo.setAttribute('tabindex', '-1');
  titulo.focus({ preventScroll: true });
  history.replaceState(null, '', `#${seccion.id}`);
}

/** Pide a animaciones.js que termine al instante las apariciones de la sección. */
function mostrarSeccion(seccion) {
  document.dispatchEvent(new CustomEvent('zenite:mostrar-seccion', { detail: { seccion } }));
}

// Si el visitante ya empezó a desplazarse, no se le mueve la página.
let visitanteSeDesplazo = false;
['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((tipo) => {
  window.addEventListener(tipo, () => { visitanteSeDesplazo = true; }, { once: true, passive: true });
});

/**
 * Al abrir una página sin #sección (por ejemplo, un servicio o la política de
 * datos desde el pie), la vista empieza en el inicio de la página.
 *
 * El navegador ya lo hace en una ventana normal, pero cuando el sitio se ve
 * dentro de un marco que se desplaza por fuera (el visor de la vista previa,
 * una incrustación), el desplazamiento exterior se conserva y la página nueva
 * aparece mostrando su pie. scrollIntoView() también desplaza esos
 * contenedores exteriores. Solo actúa si el inicio de la página no se ve.
 */
function mostrarInicioDePagina() {
  if (window.location.hash || !('IntersectionObserver' in window)) return;
  const inicio = document.createElement('div');
  inicio.setAttribute('aria-hidden', 'true');
  inicio.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none';
  document.body.prepend(inicio);
  const observador = new IntersectionObserver(([entrada]) => {
    observador.disconnect();
    if (!entrada.isIntersecting && !visitanteSeDesplazo) inicio.scrollIntoView({ behavior: 'instant', block: 'start' });
    inicio.remove();
  });
  observador.observe(inicio);
}

/**
 * Corrige la posición cuando se llega con una sección en la dirección
 * (por ejemplo, index.html#contacto desde el pie de una página de servicio).
 * El navegador salta a la sección apenas carga el HTML, pero el portafolio,
 * el simulador y las imágenes se cargan después y empujan el contenido hacia
 * abajo; por eso se vuelve a ubicar la sección cuando todo terminó de cargar.
 */
export function reubicarSeccionInicial() {
  if (visitanteSeDesplazo || !window.location.hash) return;
  const seccion = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
  if (!seccion) return;
  mostrarSeccion(seccion);
  desplazarSinAnimacion(seccion);
}

/**
 * La primera sección (el hero) va debajo del encabezado transparente, así que
 * para ella se lleva la vista al tope de la página; las demás se alinean bajo
 * el encabezado gracias a scroll-padding-top.
 */
function desplazarSinAnimacion(seccion) {
  if (seccion.offsetTop >= 2) {
    seccion.scrollIntoView({ behavior: 'instant', block: 'start' });
    return;
  }
  // scroll-padding-top (reservado para el encabezado) no aplica al tope de la página.
  const raiz = document.documentElement;
  const relleno = raiz.style.scrollPaddingTop;
  raiz.style.scrollPaddingTop = '0px';
  document.body.scrollIntoView({ behavior: 'instant', block: 'start' });
  raiz.style.scrollPaddingTop = relleno;
}

function iniciarSeccionActiva() {
  // Bootstrap Scrollspy dispara este evento al cambiar la sección activa.
  window.addEventListener('activate.bs.scrollspy', () => {
    document.querySelectorAll('.panel-menu__enlace').forEach((enlace) => {
      if (enlace.classList.contains('active')) enlace.setAttribute('aria-current', 'location');
      else enlace.removeAttribute('aria-current');
    });
  });
}
