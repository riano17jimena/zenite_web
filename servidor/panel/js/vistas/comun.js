import { h } from '../ui.js';

/** Encabezado de una sección del panel: título (recibe el foco), descripción y acciones. */
export function encabezado(titulo, descripcion, ...acciones) {
  return h('div', { class: 'encabezado-vista' },
    h('div', {}, h('h1', { text: titulo }), descripcion ? h('p', { class: 'texto-suave', text: descripcion }) : null),
    acciones.length ? h('div', { class: 'grupo-botones' }, acciones) : null);
}

/** Recordatorio de que los cambios quedan en borrador hasta publicarlos. */
export function avisoBorrador(esAdmin) {
  return h('p', { class: 'mensaje mensaje-info' },
    'Los cambios se guardan como borrador y no se ven en el sitio hasta ',
    esAdmin ? h('a', { href: '#/publicar', text: 'publicarlos' }) : 'que un administrador los publique',
    '. Puedes revisarlos antes con la ', h('a', { href: '#/publicar', text: 'vista previa' }), '.');
}
