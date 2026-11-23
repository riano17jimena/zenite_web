/** Cambiar la contraseña propia. */
import { enviar } from '../api.js';
import { anunciar, campo, conBotonOcupado, h, leerFormulario, mostrarErrores } from '../ui.js';
import { encabezado } from './comun.js';

export async function mostrar(contenedor, ctx) {
  const form = h('form', { class: 'tarjeta', novalidate: true },
    campo({ nombre: 'actual', etiqueta: 'Contraseña actual', tipo: 'contrasena', requerido: true, autocompletar: 'current-password' }),
    campo({ nombre: 'nueva', etiqueta: 'Contraseña nueva', tipo: 'contrasena', requerido: true, autocompletar: 'new-password', ayuda: 'Mínimo 10 caracteres, con al menos una letra y un número.' }),
    campo({ nombre: 'confirmar', etiqueta: 'Repite la contraseña nueva', tipo: 'contrasena', requerido: true, autocompletar: 'new-password' }));
  const boton = h('button', { type: 'submit', class: 'boton boton-primario', text: 'Cambiar contraseña' });
  form.append(boton);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = leerFormulario(form);
    if (d.nueva !== d.confirmar) return mostrarErrores(form, { message: 'Revisa los campos marcados.', detalles: { confirmar: 'Las contraseñas no coinciden.' } });
    try {
      const r = await conBotonOcupado(boton, () => enviar('/api/auth/contrasena', { actual: d.actual, nueva: d.nueva }));
      form.reset();
      form.querySelector('.resumen-errores')?.remove();
      anunciar(r.mensaje);
    } catch (error) { mostrarErrores(form, error); }
  });
  contenedor.append(encabezado(ctx.titulo, `Tu usuario: ${ctx.usuario.correo}. Cada vez que ingresas te enviamos un código a este correo.`), form);
}
