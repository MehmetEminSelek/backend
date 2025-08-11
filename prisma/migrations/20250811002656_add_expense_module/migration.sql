-- CreateTable
CREATE TABLE "MasrafKategori" (
    "id" SERIAL NOT NULL,
    "ad" TEXT NOT NULL,
    "aciklama" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasrafKategori_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Masraf" (
    "id" SERIAL NOT NULL,
    "kategoriId" INTEGER NOT NULL,
    "tutar" DOUBLE PRECISION NOT NULL,
    "paraBirimi" TEXT NOT NULL DEFAULT 'TRY',
    "tarih" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aciklama" TEXT,
    "belgeUrl" TEXT,
    "personelId" INTEGER,
    "kiraMi" BOOLEAN NOT NULL DEFAULT false,
    "maasMi" BOOLEAN NOT NULL DEFAULT false,
    "faturaId" INTEGER,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Masraf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasrafFatura" (
    "id" SERIAL NOT NULL,
    "faturaNo" TEXT NOT NULL,
    "tarih" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toplamTutar" DOUBLE PRECISION NOT NULL,
    "paraBirimi" TEXT NOT NULL DEFAULT 'TRY',
    "aciklama" TEXT,
    "dosyaUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasrafFatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MasrafKategori_ad_key" ON "MasrafKategori"("ad");

-- CreateIndex
CREATE INDEX "Masraf_kategoriId_idx" ON "Masraf"("kategoriId");

-- CreateIndex
CREATE INDEX "Masraf_personelId_idx" ON "Masraf"("personelId");

-- CreateIndex
CREATE UNIQUE INDEX "MasrafFatura_faturaNo_key" ON "MasrafFatura"("faturaNo");

-- AddForeignKey
ALTER TABLE "Masraf" ADD CONSTRAINT "Masraf_kategoriId_fkey" FOREIGN KEY ("kategoriId") REFERENCES "MasrafKategori"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Masraf" ADD CONSTRAINT "Masraf_personelId_fkey" FOREIGN KEY ("personelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Masraf" ADD CONSTRAINT "Masraf_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "MasrafFatura"("id") ON DELETE SET NULL ON UPDATE CASCADE;
