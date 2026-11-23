-- AlterTable
ALTER TABLE "insumo" ADD COLUMN     "imagen_id" INTEGER;

-- AddForeignKey
ALTER TABLE "insumo" ADD CONSTRAINT "insumo_imagen_id_fkey" FOREIGN KEY ("imagen_id") REFERENCES "medio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
