/**
 * Cliente de la API del panel. Envía la cookie de sesión y la cabecera
 * anti-CSRF en cada solicitud, y convierte los errores en mensajes claros.
 */
export class ErrorApi extends Error {
  constructor(estado, datos) {
    super(datos?.error || 'No pudimos completar la acción. Revisa tu conexión e inténtalo de nuevo.');
    this.estado = estado;
    this.detalles = datos?.detalles ?? null;
  }
}

function alExpirar(estado, ruta) {
  if (estado === 401 && !ruta.startsWith('/api/auth/')) {
    window.location.href = `/panel/?sesion=expirada&volver=${encodeURIComponent(window.location.hash)}`;
  }
}

export async function api(metodo, ruta, cuerpo) {
  const opciones = { method: metodo, credentials: 'same-origin', headers: { 'X-Zenite-Panel': '1', Accept: 'application/json' } };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  let respuesta;
  try {
    respuesta = await fetch(ruta, opciones);
  } catch {
    throw new ErrorApi(0, { error: 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.' });
  }
  if (respuesta.status === 204) return null;
  const tipo = respuesta.headers.get('content-type') ?? '';
  const datos = tipo.includes('json') ? await respuesta.json().catch(() => null) : null;
  if (!respuesta.ok) {
    alExpirar(respuesta.status, ruta);
    throw new ErrorApi(respuesta.status, datos);
  }
  return datos;
}

export const obtener = (ruta) => api('GET', ruta);
export const enviar = (ruta, cuerpo = {}) => api('POST', ruta, cuerpo);
export const reemplazar = (ruta, cuerpo) => api('PUT', ruta, cuerpo);
export const modificar = (ruta, cuerpo) => api('PATCH', ruta, cuerpo);
export const eliminar = (ruta) => api('DELETE', ruta);

/** Sube un archivo mostrando el avance. alAvanzar recibe un número de 0 a 100. */
export function subirArchivo(archivo, alt, alAvanzar) {
  return new Promise((resolver, rechazar) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/medios');
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Zenite-Panel', '1');
    xhr.setRequestHeader('Content-Type', archivo.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Nombre-Archivo', encodeURIComponent(archivo.name));
    if (alt) xhr.setRequestHeader('X-Texto-Alternativo', encodeURIComponent(alt));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) alAvanzar?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => rechazar(new ErrorApi(0, { error: 'Se interrumpió la subida. Revisa tu conexión e inténtalo de nuevo.' }));
    xhr.onload = () => {
      let datos = null;
      try { datos = JSON.parse(xhr.responseText); } catch { /* sin cuerpo */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolver(datos);
      alExpirar(xhr.status, '/api/admin/medios');
      return rechazar(new ErrorApi(xhr.status, datos));
    };
    xhr.send(archivo);
  });
}

/** Descarga un archivo de la API (Word, respaldo) conservando la sesión. */
export async function descargar(ruta, nombrePorDefecto) {
  const r = await fetch(ruta, { credentials: 'same-origin', headers: { 'X-Zenite-Panel': '1' } });
  if (!r.ok) {
    const datos = await r.json().catch(() => null);
    alExpirar(r.status, ruta);
    throw new ErrorApi(r.status, datos);
  }
  const nombre = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? nombrePorDefecto;
  const url = URL.createObjectURL(await r.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return nombre;
}
