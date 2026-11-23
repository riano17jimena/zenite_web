/**
 * Respaldo completo de la base de datos con pg_dump (formato personalizado,
 * comprimido). Lo usa el flujo semanal de GitHub Actions y se puede ejecutar a mano.
 * Uso: DIRECT_URL=postgresql://... npm run respaldo  →  respaldos/zenite-AAAA-MM-DD.dump
 * Restaurar: pg_restore --clean --no-owner -d "$DIRECT_URL" respaldos/zenite-AAAA-MM-DD.dump
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Define DIRECT_URL (conexión directa de Supabase, puerto 5432).');
  process.exit(1);
}
const carpeta = path.resolve(process.env.CARPETA_RESPALDOS || 'respaldos');
mkdirSync(carpeta, { recursive: true });
const archivo = path.join(carpeta, `zenite-${new Date().toISOString().slice(0, 10)}.dump`);
const r = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--schema=public', `--file=${archivo}`, url], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error('pg_dump falló. Verifica que esté instalado (PostgreSQL 15 o superior) y que la URL sea correcta.');
  process.exit(r.status ?? 1);
}
console.log(`Respaldo guardado en ${archivo}`);
