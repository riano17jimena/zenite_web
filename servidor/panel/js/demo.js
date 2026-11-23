/**
 * Solo en modo demostración: bandeja de correo simulada para ver los códigos
 * de acceso, enlaces y cotizaciones que en producción llegan por correo.
 */
import { abrirDialogo, formatoFecha, h } from './ui.js';

export async function hayDemo() {
  try {
    const r = await fetch('/api/demo/correos', { credentials: 'same-origin' });
    return r.ok;
  } catch { return false; }
}

export async function abrirBandeja() {
  const r = await fetch('/api/demo/correos', { credentials: 'same-origin' });
  const correos = r.ok ? await r.json() : [];
  const { cuerpo, pie, cerrar } = abrirDialogo({ titulo: 'Bandeja de correo de prueba' });
  cuerpo.append(h('p', { class: 'texto-suave', text: 'Modo demostración: estos correos no se envían de verdad. En producción llegan a la bandeja de cada persona.' }));
  if (!correos.length) cuerpo.append(h('p', { class: 'vacio', text: 'Todavía no hay correos.' }));
  cuerpo.append(h('ol', { class: 'lista-ordenable' }, correos.map((c) => h('li', { class: 'tarjeta' },
    h('h3', { text: c.asunto }),
    h('p', { class: 'texto-suave texto-pequeno', text: `Para: ${c.para} · ${formatoFecha(c.fecha)}` }),
    h('p', { text: c.texto }),
    c.adjuntos?.length ? h('p', { class: 'texto-pequeno', text: `Adjunto: ${c.adjuntos.map((a) => a.filename).join(', ')}` }) : null))));
  pie.append(h('button', { type: 'button', class: 'boton boton-primario', text: 'Cerrar', onClick: () => cerrar() }));
}

export async function mostrarEnlaceDemo(contenedor) {
  if (!contenedor || !(await hayDemo())) return false;
  contenedor.hidden = false;
  contenedor.append(h('span', { class: 'insignia insignia-aviso', text: 'Demostración' }), ' ',
    h('button', { type: 'button', class: 'boton boton-texto', text: 'Ver bandeja de correo de prueba', onClick: abrirBandeja }));
  return true;
}
