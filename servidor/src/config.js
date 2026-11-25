/**
 * Configuración leída de variables de entorno (ver .env.ejemplo).
 * Falla al iniciar si falta una variable obligatoria en producción.
 * @module config
 */
const entorno = process.env;

function leer(nombre, porDefecto) {
  const valor = entorno[nombre];
  return valor === undefined || valor === '' ? porDefecto : valor;
}

export function cargarConfiguracion(valores = {}) {
  const produccion = (valores.NODE_ENV ?? leer('NODE_ENV', 'development')) === 'production';
  const demo = (valores.ZENITE_DEMO ?? leer('ZENITE_DEMO', '')) === '1';
  const v = (nombre, porDefecto) => valores[nombre] ?? leer(nombre, porDefecto);

  const config = {
    produccion,
    demo,
    puerto: Number(v('PORT', 3000)),
    // Dirección pública de esta API (Render) y del sitio público (Netlify)
    urlApi: v('URL_API', 'http://localhost:3000'),
    urlSitio: v('URL_SITIO', demo ? v('URL_API', 'http://localhost:3000') : 'http://localhost:8080'),
    // En modo demostración el mismo servidor entrega el sitio público, el panel y la API
    servirSitio: demo || v('SERVIR_SITIO', '') === '1',
    origenesPermitidos: v('ORIGENES_PERMITIDOS', 'http://localhost:8080,http://127.0.0.1:8080').split(',').map((s) => s.trim()).filter(Boolean),
    secreto: v('SECRETO_SESIONES', produccion ? undefined : 'solo-para-desarrollo-cambiar-en-produccion'),
    // Correo: Brevo (API HTTP, solo pide verificar un remitente, sin dominio propio) si hay
    // clave; si no, Resend (igual por API, pero sin dominio verificado solo entrega al
    // correo de su propia cuenta); si no, SMTP (Gmail) solo para desarrollo local, porque
    // Render bloquea las conexiones SMTP salientes.
    brevo: {
      apiKey: v('BREVO_API_KEY', ''),
      remitente: v('BREVO_REMITENTE', 'Zenite Web <zeniteark@gmail.com>'),
    },
    resend: {
      apiKey: v('RESEND_API_KEY', ''),
      remitente: v('RESEND_REMITENTE', 'Zenite Web <onboarding@resend.dev>'),
    },
    smtp: {
      host: v('SMTP_HOST', 'smtp.gmail.com'),
      puerto: Number(v('SMTP_PUERTO', 465)),
      seguro: v('SMTP_SEGURO', 'true') === 'true',
      usuario: v('SMTP_USUARIO', ''),
      contrasena: v('SMTP_CONTRASENA', ''),
      remitente: v('CORREO_REMITENTE', 'Zenite Web <zeniteark@gmail.com>'),
    },
    correoNotificaciones: v('CORREO_NOTIFICACIONES', 'zeniteark@gmail.com'),
    // Archivos
    almacenamiento: {
      proveedor: v('ALMACENAMIENTO', produccion ? 'supabase' : 'local'),
      supabaseUrl: v('SUPABASE_URL', ''),
      supabaseClave: v('SUPABASE_SERVICE_ROLE_KEY', ''),
      bucket: v('SUPABASE_BUCKET', 'zenite-medios'),
      carpetaLocal: v('CARPETA_MEDIOS', 'medios-locales'),
    },
    limites: {
      imagenBytes: 10 * 1024 * 1024,
      videoBytes: 50 * 1024 * 1024,
      intentosAcceso: 5,
      minutosBloqueo: Number(v('MINUTOS_BLOQUEO', 15)),
      horasSesion: Number(v('HORAS_SESION', 8)),
      minutosCodigo: 10,
      minutosRecuperacion: 30,
    },
    // Ley 1581: tiempo que se conservan las solicitudes antes de anonimizarlas
    mesesRetencionSolicitudes: Number(v('MESES_RETENCION_SOLICITUDES', 24)),
    versionPolitica: v('VERSION_POLITICA', '2026-11'),
  };

  if (produccion && !demo) {
    const faltan = [];
    if (!config.secreto || config.secreto.length < 32) faltan.push('SECRETO_SESIONES (mínimo 32 caracteres)');
    if (!entorno.DATABASE_URL && !valores.DATABASE_URL) faltan.push('DATABASE_URL');
    if (config.almacenamiento.proveedor === 'supabase' && (!config.almacenamiento.supabaseUrl || !config.almacenamiento.supabaseClave)) faltan.push('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
    if (!config.brevo.apiKey && !config.resend.apiKey && (!config.smtp.usuario || !config.smtp.contrasena)) faltan.push('BREVO_API_KEY, RESEND_API_KEY, o SMTP_USUARIO y SMTP_CONTRASENA');
    if (faltan.length) throw new Error(`Faltan variables de entorno: ${faltan.join(', ')}`);
  }
  return config;
}
