/** Borrador, vista previa, publicación y versiones anteriores. */
import { enviar, obtener } from '../api.js';
import {
  anunciar, anunciarError, campo, confirmar, conBotonOcupado, formatoFecha, h, tabla,
} from '../ui.js';
import { encabezado } from './comun.js';

export async function mostrar(contenedor, ctx) {
  const estado = await obtener('/api/admin/publicacion/estado');
  const tarjetaEstado = h('section', { class: 'tarjeta', 'aria-labelledby': 'titulo-estado' },
    h('h2', { id: 'titulo-estado', text: 'Estado del sitio' }),
    estado.hayCambios
      ? h('p', {}, h('span', { class: 'insignia insignia-aviso', text: 'Hay cambios sin publicar' }), ' El borrador tiene cambios que todavía no se ven en el sitio.')
      : h('p', {}, h('span', { class: 'insignia insignia-exito', text: 'Todo publicado' }), ' El sitio muestra la última versión del borrador.'),
    estado.ultima ? h('p', { class: 'texto-suave texto-pequeno', text: `Versión publicada: ${estado.ultima.version}, el ${formatoFecha(estado.ultima.publicada)}${estado.ultima.por ? ` por ${estado.ultima.por}` : ''}${estado.ultima.nota ? ` («${estado.ultima.nota}»)` : ''}.` }) : null);

  const botonVista = h('button', {
    type: 'button', class: 'boton boton-secundario', text: 'Abrir vista previa',
    onClick: async (e) => {
      // Se abre la pestaña de inmediato (evita el bloqueo de ventanas) y luego se le da la dirección.
      const ventana = window.open('', '_blank');
      if (ventana) ventana.opener = null;
      try {
        const r = await conBotonOcupado(e.currentTarget, () => enviar('/api/admin/publicacion/vista-previa'), 'Preparando…');
        if (ventana) ventana.location = r.url; else window.open(r.url, '_blank', 'noopener');
        anunciar(`La vista previa se abrió en otra pestaña. El enlace dura ${r.minutos} minutos.`);
      } catch (error) { ventana?.close(); anunciarError(error); }
    },
  });
  const zonaVista = h('section', { class: 'tarjeta', 'aria-labelledby': 'titulo-vista' },
    h('h2', { id: 'titulo-vista', text: '1. Revisa la vista previa' }),
    h('p', { text: 'Muestra el sitio con los cambios del borrador, exactamente como quedará. Solo tú ves esta vista (el enlace vence en 30 minutos).' }),
    botonVista);
  contenedor.append(encabezado(ctx.titulo, 'Los cambios que haces en el panel se guardan como borrador. Revísalos con la vista previa y publícalos cuando estén listos.'), tarjetaEstado, zonaVista);

  if (!ctx.esAdmin) {
    contenedor.append(h('p', { class: 'mensaje mensaje-info', text: 'Solo los administradores pueden publicar. Cuando termines, avísale al administrador para que revise y publique.' }));
    return;
  }

  const nota = campo({ nombre: 'nota', etiqueta: 'Nota de esta publicación (opcional)', max: 200, ayuda: 'Ej.: Nuevo proyecto en Paipa y cambio de horario.' });
  const publicar = h('button', { type: 'submit', class: 'boton boton-primario', text: 'Publicar ahora' });
  const form = h('form', { class: 'tarjeta', 'aria-labelledby': 'titulo-publicar' }, h('h2', { id: 'titulo-publicar', text: '2. Publica' }),
    h('p', { text: 'El sitio se actualiza en máximo un minuto. Siempre podrás volver a una versión anterior.' }), nota, publicar);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!estado.hayCambios && !(await confirmar({ titulo: 'Publicar sin cambios', mensaje: 'El borrador es igual a lo publicado. ¿Quieres publicar de todos modos?', aceptar: 'Publicar' }))) return;
    try {
      const r = await conBotonOcupado(publicar, () => enviar('/api/admin/publicacion/publicar', { nota: form.elements.nota.value }), 'Publicando…');
      anunciar(`Publicaste la versión ${r.version}. El sitio ya muestra los cambios.`);
      location.hash = '#/publicar';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) { anunciarError(error); }
  });
  contenedor.append(form);

  const versiones = await obtener('/api/admin/publicaciones');
  contenedor.append(h('section', { 'aria-labelledby': 'titulo-versiones' }, h('h2', { id: 'titulo-versiones', text: 'Versiones publicadas' }),
    h('p', { class: 'texto-suave texto-pequeno', text: 'Restaurar vuelve a publicar el contenido de esa versión. El borrador no cambia.' }),
    tabla({
      titulo: 'Versiones publicadas',
      filas: versiones,
      columnas: [
        { titulo: 'Versión', valor: (v) => `${v.version}${v === versiones[0] ? ' (actual)' : ''}` },
        { titulo: 'Fecha', valor: (v) => formatoFecha(v.publicada) },
        { titulo: 'Publicó', valor: (v) => v.por ?? 'Sistema' },
        { titulo: 'Nota', valor: (v) => v.nota ?? '—' },
        {
          titulo: 'Acciones', clase: 'acciones', valor: (v) => (v === versiones[0] ? '—' : h('button', {
            type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Restaurar', 'aria-label': `Restaurar la versión ${v.version}`,
            onClick: async () => {
              if (!(await confirmar({ titulo: 'Restaurar versión', mensaje: `¿Volver a publicar el contenido de la versión ${v.version}?`, aceptar: 'Restaurar' }))) return;
              try { const r = await enviar(`/api/admin/publicaciones/${v.id}/restaurar`); anunciar(`Se publicó la versión ${r.version} con el contenido de la ${v.version}.`); window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (e) { anunciarError(e); }
            },
          })),
        },
      ],
    })));
}
