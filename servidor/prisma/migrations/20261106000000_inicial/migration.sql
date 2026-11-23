-- Migración inicial de Zenite Web (equivalente a `prisma migrate dev --name inicial`).

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMINISTRADOR', 'EDITOR');

-- CreateEnum
CREATE TYPE "PropositoCodigo" AS ENUM ('SEGUNDO_FACTOR', 'RECUPERACION');

-- CreateEnum
CREATE TYPE "TipoMedio" AS ENUM ('IMAGEN', 'VIDEO');

-- CreateEnum
CREATE TYPE "EstadoMedio" AS ENUM ('PROCESANDO', 'LISTO', 'ERROR');

-- CreateEnum
CREATE TYPE "TipoDatoContacto" AS ENUM ('WHATSAPP', 'TELEFONO', 'CORREO', 'INSTAGRAM', 'DIRECCION', 'HORARIO', 'OTRO');

-- CreateEnum
CREATE TYPE "AccionHistorial" AS ENUM ('CREAR', 'ACTUALIZAR', 'ELIMINAR', 'ORDENAR', 'PUBLICAR', 'RESTAURAR');

-- CreateEnum
CREATE TYPE "TipoInsumo" AS ENUM ('MATERIAL', 'EQUIPO', 'MANO_OBRA', 'TRANSPORTE', 'SUBCONTRATO', 'AUXILIAR', 'OTRO');

-- CreateEnum
CREATE TYPE "CategoriaServicio" AS ENUM ('CONSULTORIA', 'FINANCIERA');

-- CreateEnum
CREATE TYPE "UnidadCobro" AS ENUM ('M2', 'GLOBAL', 'MES', 'UNIDAD', 'HORA');

-- CreateEnum
CREATE TYPE "SeccionCotizacion" AS ENUM ('CONSULTORIA', 'CONSTRUCCION', 'FINANCIERA');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('NUEVA', 'EN_REVISION', 'CONTACTADA', 'CERRADA', 'DESCARTADA');

-- CreateTable
CREATE TABLE "usuario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'EDITOR',
    "hash_contrasena" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMP(3),
    "ultimo_acceso" TIMESTAMP(3),
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion" (
    "id" TEXT NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "expira" TIMESTAMP(3) NOT NULL,
    "ultima_actividad" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "agente" TEXT,
    "creada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigo_verificacion" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "proposito" "PropositoCodigo" NOT NULL,
    "hash_desafio" TEXT NOT NULL,
    "hash_codigo" TEXT NOT NULL,
    "expira" TIMESTAMP(3) NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "usado" TIMESTAMP(3),
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigo_verificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medio" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoMedio" NOT NULL,
    "clave" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "ancho" INTEGER,
    "alto" INTEGER,
    "duracion" DOUBLE PRECISION,
    "alt" TEXT,
    "nombre" TEXT NOT NULL,
    "estado" "EstadoMedio" NOT NULL DEFAULT 'LISTO',
    "error" TEXT,
    "variantes" JSONB,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "antetitulo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "imagen_id" INTEGER,
    "imagen_alt" TEXT NOT NULL,
    "pie_imagen" TEXT,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "ubicacion" TEXT,
    "anio" INTEGER,
    "area" INTEGER,
    "descripcion" TEXT NOT NULL,
    "destacado" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imagen_proyecto" (
    "id" SERIAL NOT NULL,
    "proyecto_id" INTEGER NOT NULL,
    "medio_id" INTEGER NOT NULL,
    "alt" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "imagen_proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "transcripcion" TEXT,
    "duracion_seg" INTEGER,
    "archivo_id" INTEGER NOT NULL,
    "poster_id" INTEGER,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testimonio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "proyecto" TEXT NOT NULL,
    "ciudad" TEXT,
    "comentario" TEXT NOT NULL,
    "foto_id" INTEGER,
    "foto_alt" TEXT,
    "autorizado" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testimonio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pregunta_frecuente" (
    "id" SERIAL NOT NULL,
    "pregunta" TEXT NOT NULL,
    "respuesta" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pregunta_frecuente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dato_contacto" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoDatoContacto" NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "enlace" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dato_contacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "lema" TEXT,
    "mision" TEXT,
    "formacion" TEXT NOT NULL,
    "trayectoria" TEXT NOT NULL,
    "experiencia" TEXT,
    "foto_id" INTEGER,
    "foto_alt" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publicacion" (
    "id" SERIAL NOT NULL,
    "version" INTEGER NOT NULL,
    "contenido" JSONB NOT NULL,
    "nota" TEXT,
    "restaurada_de" INTEGER,
    "publicada_por_id" INTEGER,
    "publicada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_cambio" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT,
    "accion" "AccionHistorial" NOT NULL,
    "resumen" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_cambio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capitulo" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "visible_publico" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "capitulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actividad" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "capitulo_id" INTEGER NOT NULL,
    "subcapitulo" TEXT,
    "descripcion" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "precio_unitario" DECIMAL(14,2) NOT NULL,
    "visible_publico" BOOLEAN NOT NULL DEFAULT true,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insumo" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "tipo" "TipoInsumo" NOT NULL DEFAULT 'MATERIAL',
    "precio" DECIMAL(14,2) NOT NULL,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "componente_apu" (
    "id" SERIAL NOT NULL,
    "actividad_id" INTEGER,
    "auxiliar_id" INTEGER,
    "insumo_id" INTEGER,
    "grupo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "cantidad" DECIMAL(18,6) NOT NULL,
    "precio" DECIMAL(14,2) NOT NULL,
    "porcentaje" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "componente_apu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicio_catalogo" (
    "id" SERIAL NOT NULL,
    "categoria" "CategoriaServicio" NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "unidad" "UnidadCobro" NOT NULL,
    "precio" DECIMAL(14,2) NOT NULL,
    "cargo_minimo" DECIMAL(14,2),
    "provisional" BOOLEAN NOT NULL DEFAULT true,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servicio_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_cotizador" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "administracion" DECIMAL(6,4) NOT NULL DEFAULT 0.10,
    "imprevistos" DECIMAL(6,4) NOT NULL DEFAULT 0.05,
    "utilidad" DECIMAL(6,4) NOT NULL DEFAULT 0.05,
    "iva_sobre_utilidad" DECIMAL(6,4) NOT NULL DEFAULT 0.19,
    "validez_dias" INTEGER NOT NULL DEFAULT 15,
    "correo_destino" TEXT NOT NULL DEFAULT 'zeniteark@gmail.com',
    "aviso_referencial" TEXT NOT NULL,
    "condiciones_pago" TEXT NOT NULL,
    "datos_pago" TEXT,
    "max_lineas" INTEGER NOT NULL DEFAULT 60,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_cotizador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre_cliente" TEXT NOT NULL,
    "correo_cliente" TEXT NOT NULL,
    "telefono_cliente" TEXT NOT NULL,
    "ciudad" TEXT,
    "tipo_proyecto" TEXT,
    "area_m2" DECIMAL(12,2),
    "subtotal_consultoria" DECIMAL(16,2) NOT NULL,
    "subtotal_construccion" DECIMAL(16,2) NOT NULL,
    "subtotal_financiera" DECIMAL(16,2) NOT NULL,
    "administracion" DECIMAL(16,2) NOT NULL,
    "imprevistos" DECIMAL(16,2) NOT NULL,
    "utilidad" DECIMAL(16,2) NOT NULL,
    "iva_utilidad" DECIMAL(16,2) NOT NULL,
    "total" DECIMAL(16,2) NOT NULL,
    "parametros" JSONB NOT NULL,
    "enviada_en" TIMESTAMP(3),
    "error_envio" TEXT,
    "creada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_linea" (
    "id" SERIAL NOT NULL,
    "cotizacion_id" INTEGER NOT NULL,
    "seccion" "SeccionCotizacion" NOT NULL,
    "referencia" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "precio_unitario" DECIMAL(14,2) NOT NULL,
    "valor" DECIMAL(16,2) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cotizacion_linea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_contacto" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "tipo_proyecto" TEXT,
    "mensaje" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'FORMULARIO',
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'NUEVA',
    "notas" TEXT,
    "consentimiento" BOOLEAN NOT NULL,
    "version_politica" TEXT NOT NULL,
    "fecha_consentimiento" TIMESTAMP(3) NOT NULL,
    "ip_hash" TEXT,
    "correo_enviado" BOOLEAN NOT NULL DEFAULT false,
    "cotizacion_id" INTEGER,
    "eliminar_despues" TIMESTAMP(3) NOT NULL,
    "creada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitud_contacto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_correo_key" ON "usuario"("correo");

-- CreateIndex
CREATE INDEX "sesion_usuario_id_idx" ON "sesion"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "codigo_verificacion_hash_desafio_key" ON "codigo_verificacion"("hash_desafio");

-- CreateIndex
CREATE INDEX "codigo_verificacion_usuario_id_idx" ON "codigo_verificacion"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "medio_clave_key" ON "medio"("clave");

-- CreateIndex
CREATE INDEX "proyecto_orden_idx" ON "proyecto"("orden");

-- CreateIndex
CREATE INDEX "imagen_proyecto_proyecto_id_idx" ON "imagen_proyecto"("proyecto_id");

-- CreateIndex
CREATE UNIQUE INDEX "publicacion_version_key" ON "publicacion"("version");

-- CreateIndex
CREATE INDEX "historial_cambio_entidad_entidad_id_idx" ON "historial_cambio"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "historial_cambio_fecha_idx" ON "historial_cambio"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "capitulo_codigo_key" ON "capitulo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "actividad_codigo_key" ON "actividad"("codigo");

-- CreateIndex
CREATE INDEX "actividad_capitulo_id_idx" ON "actividad"("capitulo_id");

-- CreateIndex
CREATE UNIQUE INDEX "insumo_clave_key" ON "insumo"("clave");

-- CreateIndex
CREATE INDEX "insumo_tipo_idx" ON "insumo"("tipo");

-- CreateIndex
CREATE INDEX "componente_apu_actividad_id_idx" ON "componente_apu"("actividad_id");

-- CreateIndex
CREATE INDEX "componente_apu_auxiliar_id_idx" ON "componente_apu"("auxiliar_id");

-- CreateIndex
CREATE INDEX "componente_apu_insumo_id_idx" ON "componente_apu"("insumo_id");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_codigo_key" ON "cotizacion"("codigo");

-- CreateIndex
CREATE INDEX "cotizacion_creada_idx" ON "cotizacion"("creada");

-- CreateIndex
CREATE INDEX "cotizacion_linea_cotizacion_id_idx" ON "cotizacion_linea"("cotizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "solicitud_contacto_cotizacion_id_key" ON "solicitud_contacto"("cotizacion_id");

-- CreateIndex
CREATE INDEX "solicitud_contacto_estado_idx" ON "solicitud_contacto"("estado");

-- CreateIndex
CREATE INDEX "solicitud_contacto_creada_idx" ON "solicitud_contacto"("creada");

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_verificacion" ADD CONSTRAINT "codigo_verificacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero" ADD CONSTRAINT "hero_imagen_id_fkey" FOREIGN KEY ("imagen_id") REFERENCES "medio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagen_proyecto" ADD CONSTRAINT "imagen_proyecto_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagen_proyecto" ADD CONSTRAINT "imagen_proyecto_medio_id_fkey" FOREIGN KEY ("medio_id") REFERENCES "medio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video" ADD CONSTRAINT "video_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "medio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video" ADD CONSTRAINT "video_poster_id_fkey" FOREIGN KEY ("poster_id") REFERENCES "medio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonio" ADD CONSTRAINT "testimonio_foto_id_fkey" FOREIGN KEY ("foto_id") REFERENCES "medio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil" ADD CONSTRAINT "perfil_foto_id_fkey" FOREIGN KEY ("foto_id") REFERENCES "medio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion" ADD CONSTRAINT "publicacion_publicada_por_id_fkey" FOREIGN KEY ("publicada_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_cambio" ADD CONSTRAINT "historial_cambio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_capitulo_id_fkey" FOREIGN KEY ("capitulo_id") REFERENCES "capitulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componente_apu" ADD CONSTRAINT "componente_apu_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componente_apu" ADD CONSTRAINT "componente_apu_auxiliar_id_fkey" FOREIGN KEY ("auxiliar_id") REFERENCES "insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componente_apu" ADD CONSTRAINT "componente_apu_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "insumo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_linea" ADD CONSTRAINT "cotizacion_linea_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_contacto" ADD CONSTRAINT "solicitud_contacto_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Regla que Prisma no puede expresar: un componente pertenece a una actividad o a un auxiliar, no a ambos.
ALTER TABLE "componente_apu" ADD CONSTRAINT "componente_apu_pertenece_check" CHECK ((("actividad_id" IS NULL) <> ("auxiliar_id" IS NULL)));
