/**
 * Dónde se guardan las fotos y los videos.
 * - «supabase»: Supabase Storage (bucket público de solo lectura). Se usa la API
 *   REST de Storage con la clave service_role, que solo vive en el servidor.
 * - «local»: carpeta del servidor, para desarrollo y pruebas.
 * @module servicios/almacenamiento
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function crearAlmacenamiento(config) {
  const { proveedor } = config.almacenamiento;
  if (proveedor === 'supabase') return almacenamientoSupabase(config.almacenamiento);
  return almacenamientoLocal(config);
}

function almacenamientoSupabase({ supabaseUrl, supabaseClave, bucket }) {
  const base = supabaseUrl.replace(/\/+$/, '');
  const cabeceras = { Authorization: `Bearer ${supabaseClave}`, apikey: supabaseClave };
  const urlPublica = (clave) => `${base}/storage/v1/object/public/${bucket}/${clave.split('/').map(encodeURIComponent).join('/')}`;
  return {
    nombre: 'supabase',
    urlPublica,
    async guardar(clave, contenido, mime) {
      const respuesta = await fetch(`${base}/storage/v1/object/${bucket}/${clave}`, {
        method: 'POST',
        headers: { ...cabeceras, 'Content-Type': mime, 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' },
        body: contenido,
      });
      if (!respuesta.ok) throw new Error(`Supabase Storage respondió ${respuesta.status}: ${await respuesta.text()}`);
      return urlPublica(clave);
    },
    async eliminar(claves) {
      const lista = [].concat(claves).filter(Boolean);
      if (!lista.length) return;
      const respuesta = await fetch(`${base}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: { ...cabeceras, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: lista }),
      });
      if (!respuesta.ok) throw new Error(`Supabase Storage respondió ${respuesta.status} al eliminar.`);
    },
  };
}

function almacenamientoLocal(config) {
  // Relativa a la carpeta del servidor (no al directorio desde donde se ejecuta)
  const carpeta = path.resolve(fileURLToPath(new URL('../../', import.meta.url)), config.almacenamiento.carpetaLocal);
  const urlPublica = (clave) => `${config.urlApi}/medios/${clave}`;
  return {
    nombre: 'local',
    carpeta,
    urlPublica,
    async guardar(clave, contenido) {
      const destino = path.join(carpeta, clave);
      if (!destino.startsWith(carpeta)) throw new Error('Ruta de archivo inválida.');
      await mkdir(path.dirname(destino), { recursive: true });
      await writeFile(destino, contenido);
      return urlPublica(clave);
    },
    async eliminar(claves) {
      for (const clave of [].concat(claves).filter(Boolean)) {
        const destino = path.join(carpeta, clave);
        if (destino.startsWith(carpeta)) await rm(destino, { force: true });
      }
    },
  };
}
