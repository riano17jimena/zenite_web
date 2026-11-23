# Respaldos y recuperación

## Recomendación

Pediste una frecuencia de «cada mes y medio». Para un sitio que recibe solicitudes de clientes y cambios de precios, perder hasta 6 semanas de información es demasiado. Por eso el proyecto queda configurado así:

| Qué | Frecuencia | Dónde | Cuánto se guarda |
|---|---|---|---|
| Base de datos completa (`pg_dump`) | **Semanal**, domingo 3:00 a. m. | Artefacto privado de GitHub Actions | 90 días (≈ 13 copias) |
| Copias automáticas de Supabase | Diaria (plan Pro) | Supabase | 7 días |
| Respaldo manual desde el panel (JSON) | **Mensual**, el primer lunes | Disco externo o nube privada de Zenite | 12 meses |
| Fotos y videos | Permanentes en Supabase Storage; copia manual trimestral | Descarga del bucket | — |

Así, en el peor caso se pierde una semana, y siempre hay una copia fuera de internet.

## Respaldo automático semanal

Archivo: [`.github/workflows/respaldo-semanal.yml`](../.github/workflows/respaldo-semanal.yml).

1. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
2. Nombre `DIRECT_URL`, valor: la conexión directa de Supabase (puerto 5432).
3. Para probarlo: **Actions → Respaldo semanal de la base de datos → Run workflow**.
4. Para descargar una copia: abre la ejecución y descarga el artefacto `respaldo-zenite-N`.

El repositorio debe ser **privado**: el respaldo contiene datos personales y la base de precios.

## Respaldo manual desde el panel

**Panel → Respaldos → Descargar respaldo**. Marca «Incluir la base de precios» y «Incluir solicitudes» si quieres una copia completa. Guarda el archivo en un lugar seguro y bórralo cuando ya no lo necesites (Ley 1581).

## Respaldo manual desde la terminal

```bash
cd servidor
DIRECT_URL="postgresql://…:5432/postgres" npm run respaldo
# → respaldos/zenite-AAAA-MM-DD.dump
```

Requiere `pg_dump` 15 o superior.

## Restaurar

1. Crea (o usa) un proyecto de Supabase vacío.
2. Restaura:

   ```bash
   pg_restore --clean --if-exists --no-owner -d "$DIRECT_URL" zenite-AAAA-MM-DD.dump
   ```

3. Si cambió el proyecto, actualiza `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL` y la clave en Render.
4. Verifica: entra al panel, revisa «Publicar cambios» y abre el sitio.

## Tareas automáticas del servidor

Cada 12 horas el servidor:

- borra sesiones y códigos de verificación vencidos;
- **anonimiza** las solicitudes de contacto con más de 24 meses (Ley 1581): reemplaza nombre, correo, teléfono y mensaje.
