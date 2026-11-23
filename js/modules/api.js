/**
 * Conexión con la API de Zenite (Render).
 * La dirección se toma de <meta name="zenite-api">. En una copia local servida
 * por el propio servidor (modo demostración) se usa el mismo origen.
 * @module api
 */
export function urlApi() {
  const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
  const meta = document.querySelector('meta[name="zenite-api"]')?.content?.trim();
  if (LOCAL || !meta) return location.origin;
  return meta.replace(/\/+$/, '');
}

export class ErrorApi extends Error {
  constructor(estado, datos) {
    super(datos?.error ?? 'No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.');
    this.estado = estado;
    this.detalles = datos?.detalles ?? null;
  }
}

/**
 * Llama a la API pública. Lanza ErrorApi con el mensaje del servidor.
 * @param {string} ruta  p. ej. '/api/publico/contenido'
 * @param {{metodo?:string, cuerpo?:object, tiempo?:number}} [opciones]
 */
export async function llamarApi(ruta, { metodo = 'GET', cuerpo, tiempo = 15000 } = {}) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), tiempo);
  try {
    const respuesta = await fetch(urlApi() + ruta, {
      method: metodo,
      headers: { Accept: 'application/json', ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: control.signal,
      credentials: 'omit',
    });
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok) throw new ErrorApi(respuesta.status, datos);
    return datos;
  } catch (error) {
    if (error instanceof ErrorApi) throw error;
    throw new ErrorApi(0, { error: error.name === 'AbortError' ? 'El servidor tardó demasiado en responder. Inténtalo de nuevo en un momento.' : undefined });
  } finally {
    clearTimeout(temporizador);
  }
}
