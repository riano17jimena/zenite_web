/**
 * Conexión a la base de datos.
 * - Producción y desarrollo: PostgreSQL (Supabase) mediante Prisma.
 * - Modo demostración (ZENITE_DEMO=1): base en memoria que imita a Prisma,
 *   para probar el panel sin instalar PostgreSQL. Se borra al reiniciar.
 * @module db
 */
export async function crearDb(config) {
  if (config.demo) {
    const { crearPrismaMemoria } = await import('./demo/prisma-memoria.js');
    return crearPrismaMemoria();
  }
  const { PrismaClient } = await import('@prisma/client');
  return new PrismaClient({ log: config.produccion ? ['error'] : ['warn', 'error'] });
}
