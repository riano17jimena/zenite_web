/** Portada del sitio (hero): textos y foto principal. */
import { obtener, reemplazar } from '../api.js';
import { campoFoto } from '../componentes.js';
import { anunciar, campo, conBotonOcupado, h, leerFormulario, mostrarErrores } from '../ui.js';
import { avisoBorrador, encabezado } from './comun.js';

export async function mostrar(contenedor, ctx) {
  const hero = (await obtener('/api/admin/hero')) ?? {};
  const form = h('form', { class: 'tarjeta', novalidate: true });
  const guardar = h('button', { type: 'submit', class: 'boton boton-primario', text: 'Guardar cambios' });
  form.append(
    campo({ nombre: 'antetitulo', etiqueta: 'Antetítulo', valor: hero.antetitulo, requerido: true, max: 80, ayuda: 'Texto corto sobre el título. Ej.: Zenite Arquitectura · Colombia' }),
    campo({ nombre: 'titulo', etiqueta: 'Título principal', valor: hero.titulo, requerido: true, max: 120 }),
    campo({ nombre: 'texto', etiqueta: 'Texto de presentación', tipo: 'area', valor: hero.texto, requerido: true, max: 400 }),
    campoFoto({ nombreId: 'imagenId', nombreAlt: 'imagenAlt', etiqueta: 'Foto principal', medio: hero.imagen, alt: hero.imagenAlt, opcional: false }),
    campo({ nombre: 'pieImagen', etiqueta: 'Pie de foto (opcional)', valor: hero.pieImagen, max: 140, ayuda: 'Texto pequeño que se ve sobre la foto. Ej.: Casa campestre · Render Zenite' }),
    guardar,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await conBotonOcupado(guardar, () => reemplazar('/api/admin/hero', leerFormulario(form)));
      form.querySelector('.resumen-errores')?.remove();
      anunciar('Portada guardada en el borrador.');
    } catch (error) { mostrarErrores(form, error); }
  });
  contenedor.append(encabezado(ctx.titulo, 'Lo primero que ven los visitantes: título, texto de presentación y foto principal.'), avisoBorrador(ctx.esAdmin), form);
}
