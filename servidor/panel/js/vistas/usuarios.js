/** Usuarios del panel y sus roles (solo administradores). */
import { eliminar, enviar, modificar, obtener } from '../api.js';
import { abrirDialogo, anunciar, anunciarError, campo, confirmar, conBotonOcupado, formatoFecha, h, leerFormulario, mostrarErrores, tabla } from '../ui.js';
import { encabezado } from './comun.js';

const ROLES = [{ valor: 'EDITOR', texto: 'Editor' }, { valor: 'ADMINISTRADOR', texto: 'Administrador' }];

export async function mostrar(contenedor, ctx) {
  const zona = h('div');
  const invitar = h('button', { type: 'button', class: 'boton boton-primario', text: 'Invitar usuario', onClick: () => formulario({}, cargar) });
  contenedor.append(encabezado(ctx.titulo, 'Las personas que pueden entrar al panel. Al invitar a alguien le llega un correo para crear su contraseña.', invitar),
    h('section', { class: 'tarjeta', 'aria-labelledby': 't-roles' }, h('h2', { id: 't-roles', text: 'Qué puede hacer cada rol' }),
      tabla({
        titulo: 'Permisos por rol',
        filas: [
          ['Editar portada, portafolio, videos, testimonios, preguntas, contacto y perfil', 'Sí', 'Sí'],
          ['Subir fotos y videos; ver la vista previa', 'Sí', 'Sí'],
          ['Publicar cambios y restaurar versiones', 'No', 'Sí'],
          ['Precios del cotizador y cotizaciones', 'No', 'Sí'],
          ['Solicitudes de clientes (datos personales)', 'No', 'Sí'],
          ['Usuarios, historial de cambios y respaldos', 'No', 'Sí'],
        ],
        columnas: [{ titulo: 'Acción', valor: (f) => f[0] }, { titulo: 'Editor', valor: (f) => f[1] }, { titulo: 'Administrador', valor: (f) => f[2] }],
      })),
    zona);

  async function cargar() {
    const usuarios = await obtener('/api/admin/usuarios');
    zona.replaceChildren(tabla({
      titulo: 'Usuarios', filas: usuarios,
      columnas: [
        { titulo: 'Nombre', valor: (u) => [u.nombre, u.id === ctx.usuario.id ? ' (tú)' : ''] },
        { titulo: 'Correo', valor: (u) => u.correo },
        { titulo: 'Rol', valor: (u) => (u.rol === 'ADMINISTRADOR' ? 'Administrador' : 'Editor') },
        { titulo: 'Estado', valor: (u) => (u.bloqueado ? h('span', { class: 'insignia insignia-error', text: `Bloqueado hasta ${formatoFecha(u.bloqueadoHasta)}` }) : h('span', { class: `insignia ${u.activo ? 'insignia-exito' : ''}`, text: u.activo ? 'Activo' : 'Inactivo' })) },
        { titulo: 'Último acceso', valor: (u) => (u.ultimoAcceso ? formatoFecha(u.ultimoAcceso) : 'Nunca') },
        {
          titulo: 'Acciones', clase: 'acciones', valor: (u) => [
            h('button', { type: 'button', class: 'boton boton-secundario boton-pequeno', text: 'Editar', 'aria-label': `Editar ${u.nombre}`, onClick: () => formulario(u, cargar) }),
            u.bloqueado ? accion('Desbloquear', u, `/api/admin/usuarios/${u.id}/desbloquear`, 'Usuario desbloqueado.', cargar) : null,
            !u.ultimoAcceso ? accion('Reenviar invitación', u, `/api/admin/usuarios/${u.id}/invitacion`, 'Invitación reenviada.', cargar) : null,
            u.id !== ctx.usuario.id ? h('button', {
              type: 'button', class: 'boton boton-peligro boton-pequeno', text: 'Eliminar', 'aria-label': `Eliminar ${u.nombre}`,
              onClick: async () => {
                if (!(await confirmar({ titulo: 'Eliminar usuario', mensaje: `¿Eliminar a ${u.nombre}? Ya no podrá entrar al panel.`, detalle: 'El historial conserva sus cambios. Si solo quieres quitarle el acceso por un tiempo, edítalo y desmarca «Activo».', aceptar: 'Eliminar', peligro: true }))) return;
                try { await eliminar(`/api/admin/usuarios/${u.id}`); anunciar('Usuario eliminado.'); cargar(); } catch (e) { anunciarError(e); }
              },
            }) : null,
          ],
        },
      ],
    }));
  }
  await cargar();
}

function accion(texto, u, ruta, mensaje, recargar) {
  return h('button', {
    type: 'button', class: 'boton boton-secundario boton-pequeno', text: texto, 'aria-label': `${texto}: ${u.nombre}`,
    onClick: async (e) => {
      try {
        const r = await conBotonOcupado(e.currentTarget, () => enviar(ruta), 'Un momento…');
        if (r?.enlaceInvitacion) mostrarEnlaceInvitacion(u, r.enlaceInvitacion, r.correoEnviado); else anunciar(mensaje);
        recargar();
      } catch (err) { anunciarError(err); }
    },
  });
}

/**
 * Que Resend acepte el envío no garantiza que llegue (Gmail suele filtrar el dominio
 * compartido de pruebas onboarding@resend.dev). Por eso siempre se ofrece copiar el
 * enlace para enviarlo a mano como respaldo, aunque el correo se haya «enviado».
 */
function mostrarEnlaceInvitacion(u, enlace, correoEnviado) {
  const { cuerpo, pie, cerrar } = abrirDialogo({ titulo: 'Enlace de invitación' });
  const campoEnlace = h('input', { type: 'text', readonly: true, value: enlace, class: 'campo-texto', onClick: (e) => e.currentTarget.select() });
  const mensajeWhatsapp = `Hola ${u.nombre}, te invitamos al panel de Zenite Web. Crea tu contraseña con este enlace: ${enlace}`;
  cuerpo.append(
    h('p', {
      text: correoEnviado
        ? `Le enviamos el correo de invitación a ${u.correo}, pero a veces lo filtran como spam o no llega. Si en unos minutos no le llega, usa este enlace para enviárselo tú mismo (vence en 72 horas).`
        : `No pudimos enviarle el correo de invitación a ${u.correo}. Copia este enlace y envíaselo tú mismo, por ejemplo por WhatsApp o correo (vence en 72 horas).`,
    }),
    campoEnlace);
  pie.append(
    h('a', { href: `https://wa.me/?text=${encodeURIComponent(mensajeWhatsapp)}`, target: '_blank', rel: 'noopener', class: 'boton boton-secundario', text: 'Enviar por WhatsApp' }),
    h('button', {
      type: 'button', class: 'boton boton-primario', text: 'Copiar enlace',
      onClick: async () => { await navigator.clipboard.writeText(enlace); anunciar('Enlace copiado.'); },
    }),
    h('button', { type: 'button', class: 'boton boton-secundario', text: 'Cerrar', onClick: () => cerrar() }));
}

function formulario(u, recargar) {
  const nuevo = !u.id;
  const { cuerpo, pie, cerrar } = abrirDialogo({ titulo: nuevo ? 'Invitar usuario' : `Editar a ${u.nombre}`, tamano: 'estrecho' });
  const form = h('form', { id: 'form-usuario', novalidate: true },
    campo({ nombre: 'nombre', etiqueta: 'Nombre completo', valor: u.nombre, requerido: true, max: 80, autocompletar: 'off' }),
    campo({ nombre: 'correo', etiqueta: 'Correo', tipo: 'correo', valor: u.correo, requerido: true, autocompletar: 'off' }),
    campo({ nombre: 'rol', etiqueta: 'Rol', tipo: 'seleccion', valor: u.rol ?? 'EDITOR', opciones: ROLES, requerido: true }),
    nuevo ? null : campo({ nombre: 'activo', etiqueta: 'Activo (puede entrar al panel)', tipo: 'casilla', valor: u.activo }));
  cuerpo.append(form);
  const guardar = h('button', { type: 'submit', form: 'form-usuario', class: 'boton boton-primario', text: nuevo ? 'Enviar invitación' : 'Guardar' });
  pie.append(h('button', { type: 'button', class: 'boton boton-secundario', text: 'Cancelar', onClick: () => cerrar() }), guardar);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await conBotonOcupado(guardar, () => (nuevo ? enviar('/api/admin/usuarios', leerFormulario(form)) : modificar(`/api/admin/usuarios/${u.id}`, leerFormulario(form))));
      cerrar(); recargar();
      if (nuevo && r?.enlaceInvitacion) mostrarEnlaceInvitacion(r, r.enlaceInvitacion, r.correoEnviado); else anunciar(nuevo ? 'Invitación enviada por correo.' : 'Usuario actualizado.');
    } catch (error) { mostrarErrores(form, error); }
  });
}
