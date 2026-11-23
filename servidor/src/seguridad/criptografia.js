/**
 * Utilidades criptográficas con el módulo nativo node:crypto (sin dependencias).
 * - Contraseñas: scrypt con sal aleatoria (formato scrypt$N$r$p$sal$hash).
 * - Tokens: valores aleatorios de 32 bytes; en la base solo se guarda su SHA-256.
 * - Firmas HMAC para enlaces de vista previa.
 * @module seguridad/criptografia
 */
import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const PARAMETROS = { N: 16384, r: 8, p: 1 };
const LONGITUD = 64;

export async function cifrarContrasena(contrasena) {
  const sal = randomBytes(16);
  const hash = await scryptAsync(contrasena.normalize('NFKC'), sal, LONGITUD, { ...PARAMETROS, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', PARAMETROS.N, PARAMETROS.r, PARAMETROS.p, sal.toString('base64'), hash.toString('base64')].join('$');
}

export async function verificarContrasena(contrasena, almacenado) {
  const partes = String(almacenado).split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, sal, hash] = partes;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await scryptAsync(contrasena.normalize('NFKC'), Buffer.from(sal, 'base64'), esperado.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(esperado, calculado);
}

/** Hash que se usa cuando el correo no existe, para que la respuesta tarde lo mismo. */
export const HASH_FICTICIO = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

export const tokenAleatorio = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (texto) => createHash('sha256').update(String(texto)).digest('hex');

/** Código numérico de 6 dígitos para el segundo factor. */
export const codigoNumerico = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export function iguales(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Firma un objeto con HMAC-SHA256 y fecha de expiración: «datos.firma». */
export function firmar(datos, secreto, segundos) {
  const cuerpo = Buffer.from(JSON.stringify({ ...datos, exp: Date.now() + segundos * 1000 })).toString('base64url');
  const firma = createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

export function verificarFirma(token, secreto) {
  const [cuerpo, firma] = String(token ?? '').split('.');
  if (!cuerpo || !firma) return null;
  const esperada = createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  if (!iguales(firma, esperada)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    return datos.exp > Date.now() ? datos : null;
  } catch {
    return null;
  }
}

/** Política de contraseñas: mínimo 10 caracteres, con letras y números. */
export function validarPoliticaContrasena(contrasena) {
  const errores = [];
  if (typeof contrasena !== 'string' || contrasena.length < 10) errores.push('Debe tener al menos 10 caracteres.');
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(contrasena ?? '')) errores.push('Debe incluir al menos una letra.');
  if (!/\d/.test(contrasena ?? '')) errores.push('Debe incluir al menos un número.');
  if ((contrasena ?? '').length > 128) errores.push('No puede superar 128 caracteres.');
  return errores;
}
