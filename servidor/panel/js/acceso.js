/**
 * Páginas de acceso: ingresar (contraseña + código), recuperar y restablecer.
 */
import { enviar, obtener } from './api.js';
import { mostrarEnlaceDemo } from './demo.js';
import { anunciar, conBotonOcupado, h, leerFormulario, limpiarErrores, mostrarErrores, vaciar } from './ui.js';

const pagina = document.body.dataset.pagina;
const mensajes = document.getElementById('mensajes');

function mensaje(texto, tipo = 'info') {
  vaciar(mensajes).append(h('div', { class: `mensaje mensaje-${tipo}`, role: tipo === 'error' ? 'alert' : 'status', text: texto }));
}

function alternarVisibilidad(casilla, ...campos) {
  casilla?.addEventListener('change', () => { for (const c of campos) c.type = casilla.checked ? 'text' : 'password'; });
}

async function ingresar() {
  const parametros = new URLSearchParams(location.search);
  if (parametros.get('sesion') === 'expirada') mensaje('Tu sesión terminó por seguridad. Vuelve a ingresar.');
  try {
    await obtener('/api/auth/yo');
    location.replace(`app.html${parametros.get('volver') || ''}`);
    return;
  } catch { /* no hay sesión: se muestra el formulario */ }

  const formIngresar = document.getElementById('form-ingresar');
  const formCodigo = document.getElementById('form-codigo');
  const pasoContrasena = document.getElementById('paso-contrasena');
  const pasoCodigo = document.getElementById('paso-codigo');
  let desafio = null;
  alternarVisibilidad(document.getElementById('mostrar'), document.getElementById('contrasena'));
  document.getElementById('correo').focus();

  formIngresar.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = leerFormulario(formIngresar);
    const detalles = {};
    if (!/^\S+@\S+\.\S+$/.test(datos.correo)) detalles.correo = 'Escribe tu correo completo, por ejemplo nombre@gmail.com.';
    if (!datos.contrasena) detalles.contrasena = 'Escribe tu contraseña.';
    if (Object.keys(detalles).length) return mostrarErrores(formIngresar, { message: 'Revisa los campos marcados.', detalles });
    try {
      const r = await conBotonOcupado(formIngresar.querySelector('[type=submit]'), () => enviar('/api/auth/ingresar', datos), 'Verificando…');
      limpiarErrores(formIngresar);
      vaciar(mensajes);
      desafio = r.desafio;
      document.getElementById('correo-oculto').textContent = r.correo;
      document.getElementById('minutos').textContent = r.minutos;
      pasoContrasena.hidden = true;
      pasoCodigo.hidden = false;
      document.getElementById('codigo').focus();
      anunciar(`Te enviamos un código a ${r.correo}.`, { visible: false });
    } catch (error) {
      mostrarErrores(formIngresar, error);
      document.getElementById('contrasena').value = '';
    }
  });

  formCodigo.addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = document.getElementById('codigo').value.replace(/\D/g, '');
    if (codigo.length !== 6) return mostrarErrores(formCodigo, { message: 'Revisa el código.', detalles: { codigo: 'El código tiene 6 números.' } });
    try {
      await conBotonOcupado(formCodigo.querySelector('[type=submit]'), () => enviar('/api/auth/verificar', { desafio, codigo }), 'Entrando…');
      location.replace(`app.html${new URLSearchParams(location.search).get('volver') || ''}`);
    } catch (error) {
      mostrarErrores(formCodigo, error);
      if (/intentos|vuelve a escribir/i.test(error.message)) setTimeout(() => document.getElementById('volver').click(), 2500);
    }
  });

  document.getElementById('reenviar').addEventListener('click', async (e) => {
    try {
      const r = await conBotonOcupado(e.currentTarget, () => enviar('/api/auth/reenviar-codigo', { desafio }), 'Enviando…');
      mensaje(`Te enviamos un código nuevo a ${r.correo}. El anterior ya no sirve.`, 'exito');
      document.getElementById('codigo').focus();
    } catch (error) { mensaje(error.message, 'error'); }
  });

  document.getElementById('volver').addEventListener('click', () => {
    desafio = null;
    pasoCodigo.hidden = true;
    pasoContrasena.hidden = false;
    formCodigo.reset();
    vaciar(mensajes);
    document.getElementById('correo').focus();
  });
}

function recuperar() {
  const form = document.getElementById('form-recuperar');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = leerFormulario(form);
    if (!/^\S+@\S+\.\S+$/.test(datos.correo)) return mostrarErrores(form, { message: 'Revisa el correo.', detalles: { correo: 'Escribe tu correo completo.' } });
    try {
      const r = await conBotonOcupado(form.querySelector('[type=submit]'), () => enviar('/api/auth/recuperar', datos), 'Enviando…');
      limpiarErrores(form);
      mensaje(r.mensaje, 'exito');
      mensajes.querySelector('.mensaje').setAttribute('tabindex', '-1');
      mensajes.querySelector('.mensaje').focus();
    } catch (error) { mostrarErrores(form, error); }
  });
}

function restablecer() {
  const parametros = new URLSearchParams(location.hash.slice(1));
  const token = parametros.get('token');
  history.replaceState(null, '', location.pathname); // el enlace no queda en el historial
  const form = document.getElementById('form-restablecer');
  if (parametros.get('nuevo') === '1') {
    document.getElementById('titulo').textContent = 'Crea tu contraseña';
    document.title = 'Crea tu contraseña · Panel Zenite Web';
  }
  if (!token) {
    mensaje('El enlace no es válido. Pide uno nuevo desde «¿Olvidaste tu contraseña?».', 'error');
    form.hidden = true;
    return;
  }
  alternarVisibilidad(document.getElementById('mostrar'), document.getElementById('contrasena'), document.getElementById('confirmar'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = leerFormulario(form);
    const detalles = {};
    if (datos.contrasena.length < 10 || !/[a-zA-ZñÑ]/.test(datos.contrasena) || !/\d/.test(datos.contrasena)) detalles.contrasena = 'Usa mínimo 10 caracteres, con al menos una letra y un número.';
    if (datos.confirmar !== datos.contrasena) detalles.confirmar = 'Las dos contraseñas no coinciden.';
    if (Object.keys(detalles).length) return mostrarErrores(form, { message: 'Revisa los campos marcados.', detalles });
    try {
      const r = await conBotonOcupado(form.querySelector('[type=submit]'), () => enviar('/api/auth/restablecer', { token, contrasena: datos.contrasena }));
      form.hidden = true;
      mensaje(`${r.mensaje} Te llevamos a la página de ingreso…`, 'exito');
      setTimeout(() => location.replace('./'), 2500);
    } catch (error) { mostrarErrores(form, error); }
  });
}

({ ingresar, recuperar, restablecer })[pagina]?.();
mostrarEnlaceDemo(document.getElementById('pie-demo'));
