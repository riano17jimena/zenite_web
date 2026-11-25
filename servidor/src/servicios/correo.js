/**
 * Envío de correos con nodemailer (SMTP; por defecto Gmail con contraseña de aplicación).
 * En modo demostración o sin credenciales, los correos se guardan en memoria
 * y se muestran en el panel («Correos de prueba») en lugar de enviarse.
 * @module servicios/correo
 */
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Plantilla HTML sencilla y accesible para todos los correos. */
function plantilla({ titulo, parrafos = [], boton, pie }) {
  const cuerpo = parrafos.map((p) => `<p style="margin:0 0 16px;line-height:1.6">${p}</p>`).join('');
  const accion = boton
    ? `<p style="margin:24px 0"><a href="${escapar(boton.url)}" style="background:#E3A72F;color:#0B2A45;padding:12px 22px;border-radius:4px;text-decoration:none;font-weight:600;display:inline-block">${escapar(boton.texto)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#5B6470">Si el botón no funciona, copia esta dirección en tu navegador:<br>${escapar(boton.url)}</p>`
    : '';
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F7F4EE;font-family:Arial,Helvetica,sans-serif;color:#0B2A45">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <p style="margin:0 0 20px;font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#8A5A00">Zenite Arquitectura</p>
    <div style="background:#fff;border-radius:6px;padding:28px">
      <h1 style="font-size:22px;margin:0 0 18px;font-family:Georgia,serif;font-weight:normal">${escapar(titulo)}</h1>
      ${cuerpo}${accion}
    </div>
    <p style="margin:18px 0 0;font-size:12px;color:#5B6470">${pie ?? 'Mensaje automático de Zenite Web. No respondas a este correo.'}</p>
  </div></body></html>`;
}

export function crearServicioCorreo({ config, transporte } = {}) {
  const bandeja = []; // correos de prueba (modo demostración)
  let transporteReal = transporte ?? null;
  // SMTP (Gmail con contraseña de aplicación) va primero: no necesita dominio propio y
  // puede enviar a cualquier destinatario, a diferencia de Resend sin dominio verificado.
  // Antes fallaba en Render por timeout al conectar a smtp.gmail.com: Render suele resolver
  // ese host con IPv6 primero y la ruta IPv6 no responde, así que se obliga IPv4 (family: 4).
  const usaSmtp = !transporte && Boolean(config.smtp.usuario && config.smtp.contrasena);
  const usaResend = !transporte && !usaSmtp && Boolean(config.resend?.apiKey);
  // Sin credenciales reales de ninguno de los dos (como en pruebas o desarrollo local
  // sin configurar), se guarda en la bandeja simulada en vez de intentar enviar de verdad.
  const simulado = !transporte && !usaSmtp && !usaResend;

  async function obtenerTransporte() {
    if (transporteReal) return transporteReal;
    const nodemailer = (await import('nodemailer')).default;
    transporteReal = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.puerto,
      secure: config.smtp.seguro,
      auth: { user: config.smtp.usuario, pass: config.smtp.contrasena },
      family: 4,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
    return transporteReal;
  }

  /** Envía por la API HTTP de Resend (no usa SMTP: funciona en plataformas que lo bloquean, como Render). */
  async function enviarPorResend(mensaje) {
    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resend.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: config.resend.remitente,
        to: [mensaje.to],
        subject: mensaje.subject,
        html: mensaje.html,
        text: mensaje.text,
        reply_to: mensaje.replyTo || undefined,
        attachments: mensaje.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })),
      }),
    });
    if (!respuesta.ok) {
      const cuerpo = await respuesta.text().catch(() => '');
      throw new Error(`Resend respondió ${respuesta.status}: ${cuerpo.slice(0, 300)}`);
    }
    return respuesta.json();
  }

  async function enviar({ para, asunto, html, texto, adjuntos = [], responderA }) {
    const mensaje = { from: config.smtp.remitente, to: para, subject: asunto, html, text: texto, replyTo: responderA, attachments: adjuntos };
    if (simulado) {
      bandeja.unshift({ ...mensaje, attachments: adjuntos.map((a) => ({ filename: a.filename, bytes: a.content?.length ?? 0 })), fecha: new Date().toISOString() });
      bandeja.splice(30);
      return { simulado: true };
    }
    if (usaResend) return enviarPorResend(mensaje);
    const t = await obtenerTransporte();
    return t.sendMail(mensaje);
  }

  return {
    simulado,
    bandeja,
    enviar,
    plantilla,

    codigoAcceso: (usuario, codigo, minutos) => enviar({
      para: usuario.correo,
      asunto: `${codigo} es tu código para entrar al panel de Zenite`,
      texto: `Hola, ${usuario.nombre}. Tu código de acceso es ${codigo}. Vence en ${minutos} minutos. Si no intentaste entrar, cambia tu contraseña.`,
      html: plantilla({
        titulo: 'Tu código de acceso',
        parrafos: [`Hola, ${escapar(usuario.nombre)}.`, `Escribe este código en el panel para terminar de entrar:`,
          `<span style="font-size:32px;letter-spacing:.3em;font-weight:bold">${codigo}</span>`,
          `Vence en ${minutos} minutos. Si no intentaste entrar, cambia tu contraseña.`],
      }),
    }),

    recuperacion: (usuario, url, minutos) => enviar({
      para: usuario.correo,
      asunto: 'Restablece tu contraseña del panel de Zenite',
      texto: `Hola, ${usuario.nombre}. Para crear una contraseña nueva abre: ${url} (vence en ${minutos} minutos).`,
      html: plantilla({
        titulo: 'Crea una contraseña nueva',
        parrafos: [`Hola, ${escapar(usuario.nombre)}.`, `Recibimos una solicitud para restablecer tu contraseña. El enlace vence en ${minutos} minutos.`, 'Si no la pediste, ignora este correo: tu contraseña no cambia.'],
        boton: { texto: 'Crear contraseña nueva', url },
      }),
    }),

    invitacion: (usuario, url, horas) => enviar({
      para: usuario.correo,
      asunto: 'Te invitaron al panel de Zenite Web',
      texto: `Hola, ${usuario.nombre}. Crea tu contraseña en ${url} (vence en ${horas} horas).`,
      html: plantilla({
        titulo: 'Bienvenido al panel de Zenite',
        parrafos: [`Hola, ${escapar(usuario.nombre)}.`, `Te crearon un usuario para administrar el sitio de Zenite. Crea tu contraseña con el botón (el enlace vence en ${horas} horas).`],
        boton: { texto: 'Crear mi contraseña', url },
      }),
    }),

    bloqueo: (usuario, hasta) => enviar({
      para: usuario.correo,
      asunto: 'Bloqueamos temporalmente tu acceso al panel de Zenite',
      texto: `Hubo 5 intentos fallidos de entrar con tu correo. El acceso queda bloqueado hasta las ${hasta}.`,
      html: plantilla({
        titulo: 'Acceso bloqueado temporalmente',
        parrafos: [`Hubo 5 intentos fallidos de entrar al panel con tu correo, así que bloqueamos el acceso hasta las <strong>${escapar(hasta)}</strong>.`,
          'Si fuiste tú, espera y vuelve a intentarlo, o usa «¿Olvidaste tu contraseña?». Si no fuiste tú, avisa al administrador.'],
      }),
    }),

    nuevaSolicitud: (para, solicitud) => enviar({
      para,
      asunto: `Nueva solicitud de contacto: ${solicitud.nombre}`,
      responderA: solicitud.correo,
      texto: `${solicitud.nombre} (${solicitud.correo}, ${solicitud.telefono}) escribió: ${solicitud.mensaje}`,
      html: plantilla({
        titulo: 'Nueva solicitud desde el sitio web',
        parrafos: [
          `<strong>Nombre:</strong> ${escapar(solicitud.nombre)}<br><strong>Correo:</strong> ${escapar(solicitud.correo)}<br><strong>Teléfono:</strong> ${escapar(solicitud.telefono)}<br><strong>Tipo de proyecto:</strong> ${escapar(solicitud.tipoProyecto ?? 'Sin especificar')}`,
          `<strong>Mensaje:</strong><br>${escapar(solicitud.mensaje).replace(/\n/g, '<br>')}`,
          'La persona autorizó el tratamiento de sus datos (Ley 1581 de 2012). Puedes ver y gestionar la solicitud en el panel, sección «Solicitudes».',
        ],
      }),
    }),

    cotizacion: (para, cotizacion, documento) => enviar({
      para,
      asunto: `Cotización ${cotizacion.codigo} · ${cotizacion.nombreCliente}`,
      responderA: cotizacion.correoCliente,
      texto: `Nueva cotización ${cotizacion.codigo} de ${cotizacion.nombreCliente}. Total referencial ${cotizacion.totalTexto}.${cotizacion.descripcion ? ` Descripción: ${cotizacion.descripcion}` : ''} Documento adjunto.`,
      adjuntos: [{ filename: `${cotizacion.codigo}.docx`, content: documento, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
      html: plantilla({
        titulo: `Cotización ${escapar(cotizacion.codigo)}`,
        parrafos: [
          `<strong>${escapar(cotizacion.nombreCliente)}</strong> pidió una cotización desde el simulador del sitio web.`,
          `<strong>Correo:</strong> ${escapar(cotizacion.correoCliente)}<br><strong>Teléfono:</strong> ${escapar(cotizacion.telefonoCliente)}<br><strong>Total referencial:</strong> ${escapar(cotizacion.totalTexto)}`,
          ...(cotizacion.descripcion ? [`<strong>Descripción del proyecto:</strong><br>${escapar(cotizacion.descripcion).replace(/\n/g, '<br>')}`] : []),
          'Adjuntamos el documento en Word con el formato de cotización de Zenite. Revísalo y ajústalo antes de enviarlo al cliente.',
        ],
      }),
    }),
  };
}
