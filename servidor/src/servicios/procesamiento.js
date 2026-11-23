/**
 * Conversión de archivos subidos:
 * - Imágenes JPG, PNG o WebP (máx. 10 MB) → WebP de 1920 px y 960 px (sharp).
 * - Videos MP4, MOV o WebM (máx. 50 MB) → MP4 H.264 de hasta 1280 px con
 *   inicio rápido, y una imagen de portada en WebP (ffmpeg).
 * @module servicios/procesamiento
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];
export const TIPOS_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];
const FORMATOS_SHARP = ['jpeg', 'png', 'webp'];

async function cargarSharp() {
  return (await import('sharp')).default;
}

/** Convierte la imagen y devuelve las versiones listas para guardar. */
export async function procesarImagen(contenido) {
  const sharp = await cargarSharp();
  let metadatos;
  try {
    metadatos = await sharp(contenido).metadata();
  } catch {
    throw new Error('El archivo no es una imagen válida.');
  }
  if (!FORMATOS_SHARP.includes(metadatos.format)) throw new Error('Formato no permitido. Sube una foto JPG, PNG o WebP.');
  const base = sharp(contenido, { failOn: 'error' }).rotate(); // corrige la orientación de fotos de celular
  const grande = await base.clone().resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 84, effort: 5 }).toBuffer({ resolveWithObject: true });
  const mediana = await base.clone().resize({ width: 960, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toBuffer();
  return {
    principal: grande.data,
    ancho: grande.info.width,
    alto: grande.info.height,
    variantes: { 960: mediana },
  };
}

function rutaFfmpeg() {
  if (process.env.FFMPEG_PATH) return Promise.resolve(process.env.FFMPEG_PATH);
  return import('ffmpeg-static').then((m) => m.default ?? 'ffmpeg').catch(() => 'ffmpeg');
}

function ejecutar(binario, argumentos, limiteMs = 10 * 60_000) {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(binario, argumentos, { stdio: ['ignore', 'ignore', 'pipe'] });
    let errores = '';
    const temporizador = setTimeout(() => { proceso.kill('SIGKILL'); rechazar(new Error('El video tardó demasiado en procesarse.')); }, limiteMs);
    proceso.stderr.on('data', (d) => { errores = (errores + d.toString()).slice(-8000); });
    proceso.on('error', (e) => { clearTimeout(temporizador); rechazar(e); });
    proceso.on('close', (codigo) => {
      clearTimeout(temporizador);
      if (codigo === 0) resolver(errores); else rechazar(new Error(`ffmpeg terminó con código ${codigo}: ${errores.slice(-400)}`));
    });
  });
}

/** Comprime el video y extrae la portada. */
export async function procesarVideo(contenido) {
  const ffmpeg = await rutaFfmpeg();
  const carpeta = await mkdtemp(path.join(tmpdir(), 'zenite-video-'));
  try {
    const entrada = path.join(carpeta, 'entrada');
    const salida = path.join(carpeta, 'salida.mp4');
    const portada = path.join(carpeta, 'portada.png');
    await writeFile(entrada, contenido);
    const registro = await ejecutar(ffmpeg, [
      '-y', '-i', entrada,
      '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '96k', '-ac', '2', salida,
    ]);
    const duracion = (() => {
      const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(registro);
      return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
    })();
    await ejecutar(ffmpeg, ['-y', '-ss', String(Math.min(1, (duracion ?? 2) / 2)), '-i', salida, '-frames:v', '1', portada]);
    const sharp = await cargarSharp();
    const poster = await sharp(await readFile(portada)).resize({ width: 720, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
    return { video: await readFile(salida), poster: poster.data, ancho: poster.info.width, alto: poster.info.height, duracion };
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}
