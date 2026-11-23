/**
 * Formulario de contacto (RF-10, RF-11, RF-12, RF-19).
 * - Valida en el navegador con mensajes claros y accesibles.
 * - Envía la solicitud a la API de Zenite: queda guardada en la base de datos
 *   (con la autorización de datos, Ley 1581) y se ve en el panel.
 * @module formulario
 */
import { llamarApi } from './api.js';

const MIN_DIGITOS = 7;
const MAX_DIGITOS = 15;

/** Inicia el formulario de contacto si la página lo contiene. */
export function iniciarFormulario() {
  const form = document.getElementById('form-contacto');
  if (!form) return;

  const estado = document.getElementById('estado-envio');
  const telefono = form.elements.namedItem('telefono');
  let intentoEnvio = false;

  // Validación personalizada: se cuentan solo los dígitos del teléfono.
  telefono.addEventListener('input', () => validarTelefono(telefono));

  // Después del primer intento, cada campo se revalida al salir de él.
  form.addEventListener('focusout', (evento) => {
    if (intentoEnvio && esCampo(evento.target)) marcarCampo(evento.target);
  });
  form.addEventListener('input', (evento) => {
    if (intentoEnvio && esCampo(evento.target)) marcarCampo(evento.target);
  });

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    intentoEnvio = true;
    validarTelefono(telefono);

    const campos = [...form.elements].filter(esCampo);
    const invalidos = campos.filter((campo) => !marcarCampo(campo));
    if (invalidos.length > 0) {
      mostrarEstado(estado, `Revisa ${invalidos.length === 1 ? 'el campo marcado' : `los ${invalidos.length} campos marcados`} antes de enviar.`, true, false);
      invalidos[0].focus();
      return;
    }

    await enviar(form, estado);
    intentoEnvio = false;
  });
}

function esCampo(el) {
  return el instanceof HTMLElement && 'checkValidity' in el && el.willValidate && el.type !== 'hidden';
}

function validarTelefono(campo) {
  const digitos = campo.value.replace(/\D/g, '').length;
  const valido = campo.value === '' || (digitos >= MIN_DIGITOS && digitos <= MAX_DIGITOS);
  campo.setCustomValidity(valido ? '' : 'Número inválido');
}

/**
 * Marca un campo como válido o inválido para estilos y tecnologías de apoyo.
 * @returns {boolean} true si el campo es válido.
 */
function marcarCampo(campo) {
  const valido = campo.checkValidity();
  campo.classList.toggle('is-invalid', !valido);
  if (valido) campo.removeAttribute('aria-invalid');
  else campo.setAttribute('aria-invalid', 'true');
  return valido;
}

function mostrarEstado(contenedor, texto, esError, enfocar = true) {
  contenedor.textContent = texto;
  contenedor.classList.toggle('estado-envio--error', esError);
  if (enfocar) contenedor.focus();
}

async function enviar(form, estado) {
  const boton = form.querySelector('[type="submit"]');
  const textoBoton = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Enviando…';
  form.setAttribute('aria-busy', 'true');

  const valor = (nombre) => form.elements.namedItem(nombre)?.value.trim() ?? '';
  try {
    const r = await llamarApi('/api/publico/contacto', {
      metodo: 'POST',
      tiempo: 45000,
      cuerpo: {
        nombre: valor('nombre'), correo: valor('correo'), telefono: valor('telefono'), tipoProyecto: valor('tipoProyecto'),
        mensaje: valor('mensaje'), consentimiento: form.elements.namedItem('consentimiento').checked, sitioWeb: valor('sitioWeb'),
      },
    });
    form.reset();
    form.querySelectorAll('.is-invalid').forEach((c) => c.classList.remove('is-invalid'));
    mostrarEstado(estado, `¡Gracias! ${r.mensaje}`, false);
  } catch (error) {
    console.error('Error al enviar el formulario:', error);
    for (const [campo, mensaje] of Object.entries(error.detalles ?? {})) {
      const el = form.elements.namedItem(campo);
      if (!el) continue;
      el.classList.add('is-invalid');
      el.setAttribute('aria-invalid', 'true');
      const ayuda = document.getElementById(`${el.id}-error`);
      if (ayuda) ayuda.textContent = mensaje;
    }
    mostrarEstado(estado, `${error.message} Si el problema continúa, escríbenos por WhatsApp al 315 711 0946 o a zeniteark@gmail.com.`, true);
  } finally {
    boton.disabled = false;
    boton.textContent = textoBoton;
    form.removeAttribute('aria-busy');
  }
}
