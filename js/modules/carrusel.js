/**
 * Carruseles del sitio con Swiper 11 (portafolio, galería de cada proyecto y videos).
 *
 * El ancho de cada tarjeta lo define el CSS (slidesPerView: 'auto'), así el
 * diseño es el mismo con o sin JavaScript: si Swiper no carga, el carrusel
 * queda como una fila desplazable con scroll-snap.
 * @module carrusel
 */
const RUTA_SWIPER = '../../vendor/swiper';

let modulosSwiper;
/** Descarga Swiper y sus módulos una sola vez (import dinámico). */
function cargarSwiper() {
  modulosSwiper ??= Promise.all([
    import(`${RUTA_SWIPER}/swiper.mjs`),
    import(`${RUTA_SWIPER}/modules/navigation/navigation.mjs`),
    import(`${RUTA_SWIPER}/modules/pagination/pagination.mjs`),
    import(`${RUTA_SWIPER}/modules/a11y/a11y.mjs`),
    import(`${RUTA_SWIPER}/modules/keyboard/keyboard.mjs`),
  ]).then((modulos) => modulos.map((m) => m.default));
  return modulosSwiper;
}

/**
 * Crea un carrusel sobre un contenedor `.carrusel.swiper`.
 *
 * @param {HTMLElement} contenedor
 * @param {object} [config]
 * @param {HTMLElement} [config.controles]   Contenedor con los botones [data-carrusel].
 * @param {HTMLElement} [config.paginacion]  Contenedor de los puntos de paginación.
 * @param {string} [config.item]             Nombre de cada elemento para lectores de pantalla.
 * @param {object} [config.opciones]         Opciones adicionales de Swiper.
 * @returns {Promise<object|null>} La instancia de Swiper, o null si no pudo cargarse.
 */
export async function crearCarrusel(contenedor, { controles, paginacion, item = 'elemento', opciones = {} } = {}) {
  let Swiper; let Navigation; let Pagination; let A11y; let Keyboard;
  try {
    [Swiper, Navigation, Pagination, A11y, Keyboard] = await cargarSwiper();
  } catch (error) {
    console.error('No se pudo cargar Swiper; el carrusel funciona con desplazamiento nativo.', error);
    return null;
  }

  if (controles) controles.hidden = false;

  return new Swiper(contenedor, {
    modules: [Navigation, Pagination, A11y, Keyboard],
    slidesPerView: 'auto',
    spaceBetween: 24,
    grabCursor: true,
    watchOverflow: true,
    navigation: controles ? {
      prevEl: controles.querySelector('[data-carrusel="anterior"]'),
      nextEl: controles.querySelector('[data-carrusel="siguiente"]'),
    } : false,
    pagination: paginacion ? { el: paginacion, clickable: true } : false,
    keyboard: { enabled: true, onlyInViewport: true },
    a11y: {
      prevSlideMessage: `${capitalizar(item)} anterior`,
      nextSlideMessage: `${capitalizar(item)} siguiente`,
      firstSlideMessage: `Este es el primer ${item}`,
      lastSlideMessage: `Este es el último ${item}`,
      paginationBulletMessage: `Ir al ${item} {{index}}`,
      slideLabelMessage: `${capitalizar(item)} {{index}} de {{slidesLength}}`,
      containerRoleDescriptionMessage: 'carrusel',
      itemRoleDescriptionMessage: item,
    },
    ...opciones,
  });
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
