-- CreateEnum
CREATE TYPE "PersonelRol" AS ENUM ('GENEL_MUDUR', 'SUBE_MUDURU', 'URETIM_MUDURU', 'SEVKIYAT_MUDURU', 'CEP_DEPO_MUDURU', 'SUBE_PERSONELI', 'URETIM_PERSONEL', 'SEVKIYAT_PERSONELI', 'SOFOR', 'PERSONEL');

-- CreateEnum
CREATE TYPE "SgkDurumu" AS ENUM ('VAR', 'YOK');

-- CreateEnum
CREATE TYPE "ErpDurum" AS ENUM ('AKTIF', 'PASIF');

-- CreateEnum
CREATE TYPE "SubeTipi" AS ENUM ('SATIS_SUBESI', 'OPERASYON_BIRIMI', 'URETIM_MERKEZI', 'DEPO');

-- CreateEnum
CREATE TYPE "SatisBirimi" AS ENUM ('KG', 'GRAM', 'ADET', 'PAKET', 'KUTU', 'TEPSI', 'LITRE', 'ML');

-- CreateEnum
CREATE TYPE "FiyatTipi" AS ENUM ('NORMAL', 'KAMPANYA', 'TOPTAN', 'PERAKENDE', 'OZEL_FIYAT', 'PROMOSYON', 'INDIRIMLI');

-- CreateEnum
CREATE TYPE "AdresTipi" AS ENUM ('EV', 'IS', 'DIGER');

-- CreateEnum
CREATE TYPE "CariTipi" AS ENUM ('MUSTERI', 'TEDARIKCI', 'PERSONEL', 'BANKA', 'KASA');

-- CreateEnum
CREATE TYPE "SiparisDurumu" AS ENUM ('ONAY_BEKLEYEN', 'HAZIRLLANACAK', 'HAZIRLANDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "KargoDurumu" AS ENUM ('KARGOYA_VERILECEK', 'KARGODA', 'TESLIM_EDILDI', 'SUBEYE_GONDERILECEK', 'SUBEDE_TESLIM', 'ADRESE_TESLIMAT', 'SUBEDEN_SUBEYE', 'IPTAL');

-- CreateEnum
CREATE TYPE "OncelikSeviyesi" AS ENUM ('DUSUK', 'NORMAL', 'YUKSEK', 'ACIL');

-- CreateEnum
CREATE TYPE "MaterialTipi" AS ENUM ('HAMMADDE', 'YARI_MAMUL', 'YARDIMCI_MADDE');

-- CreateEnum
CREATE TYPE "MaterialBirimi" AS ENUM ('KG', 'GRAM', 'LITRE', 'ML', 'ADET', 'PAKET');

-- CreateEnum
CREATE TYPE "StokHareketTipi" AS ENUM ('GIRIS', 'CIKIS', 'TRANSFER', 'FIRE', 'SAYIM_FAZLA', 'SAYIM_EKSIK', 'URETIM_GIRDI', 'URETIM_CIKTI', 'IADE', 'DUZELTME');

-- CreateEnum
CREATE TYPE "TransferDurumu" AS ENUM ('BEKLIYOR', 'GONDERILDI', 'TESLIM_ALINDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "HareketTipi" AS ENUM ('BORC', 'ALACAK', 'VIRMAN');

-- CreateEnum
CREATE TYPE "OdemeYontemi" AS ENUM ('NAKIT', 'KREDI_KARTI', 'CARI', 'CEK', 'BANKA_HAVALESI', 'IKRAM');

-- CreateEnum
CREATE TYPE "OdemeDurumu" AS ENUM ('ODENDI', 'BEKLIYOR', 'GECIKTI', 'IPTAL');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'CANCEL', 'COMPLETE', 'TRANSFER', 'PAYMENT', 'LOGIN', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGE', 'PERMISSION_CHANGE', 'BULK_UPDATE', 'BULK_DELETE', 'IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "SettingDataType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "personelId" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "soyad" TEXT,
    "telefon" TEXT,
    "subeId" INTEGER,
    "rol" "PersonelRol" NOT NULL DEFAULT 'PERSONEL',
    "gunlukUcret" DOUBLE PRECISION DEFAULT 0,
    "sgkDurumu" "SgkDurumu" NOT NULL DEFAULT 'YOK',
    "girisYili" TIMESTAMP(3),
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "erpDurum" "ErpDurum" NOT NULL DEFAULT 'AKTIF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sube" (
    "id" SERIAL NOT NULL,
    "ad" TEXT NOT NULL,
    "kod" TEXT NOT NULL,
    "tip" "SubeTipi" NOT NULL DEFAULT 'SATIS_SUBESI',
    "adres" TEXT,
    "telefon" TEXT,
    "email" TEXT,
    "sorumlu" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "acilisSaat" TEXT,
    "kapanisSaat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sube_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrunKategori" (
    "id" SERIAL NOT NULL,
    "ad" TEXT NOT NULL,
    "kod" TEXT NOT NULL,
    "aciklama" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UrunKategori_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Urun" (
    "id" SERIAL NOT NULL,
    "ad" TEXT NOT NULL,
    "kod" TEXT NOT NULL,
    "kategoriId" INTEGER,
    "aciklama" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "satisaUygun" BOOLEAN NOT NULL DEFAULT true,
    "mevcutStok" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStokSeviye" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "birim" "SatisBirimi" NOT NULL DEFAULT 'KG',
    "maliyetFiyati" DOUBLE PRECISION DEFAULT 0,
    "karMarji" DOUBLE PRECISION DEFAULT 0,
    "karOrani" DOUBLE PRECISION DEFAULT 0,
    "guncellemeTarihi" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER,
    "updatedBy" INTEGER,
    "lastModifiedBy" TEXT,
    "lastModifiedAt" TIMESTAMP(3),
    "lastAction" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,

    CONSTRAINT "Urun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrunFiyat" (
    "id" SERIAL NOT NULL,
    "urunId" INTEGER NOT NULL,
    "kgFiyati" DOUBLE PRECISION NOT NULL,
    "birim" "SatisBirimi" NOT NULL DEFAULT 'KG',
    "fiyatTipi" "FiyatTipi" NOT NULL DEFAULT 'NORMAL',
    "baslangicTarihi" TIMESTAMP(3) NOT NULL,
    "bitisTarihi" TIMESTAMP(3),
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "degisiklikSebebi" TEXT,
    "eskiFiyat" DOUBLE PRECISION,
    "yuzdelik" DOUBLE PRECISION,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,

    CONSTRAINT "UrunFiyat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TepsiFiyat" (
    "id" SERIAL NOT NULL,
    "tepsiTavaId" INTEGER NOT NULL,
    "adetFiyati" DOUBLE PRECISION NOT NULL,
    "fiyatTipi" "FiyatTipi" NOT NULL DEFAULT 'NORMAL',
    "baslangicTarihi" TIMESTAMP(3) NOT NULL,
    "bitisTarihi" TIMESTAMP(3),
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "degisiklikSebebi" TEXT,
    "eskiFiyat" DOUBLE PRECISION,
    "yuzdelik" DOUBLE PRECISION,

    CONSTRAINT "TepsiFiyat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TepsiTava" (
    "id" SERIAL NOT NULL,
    "ad" TEXT NOT NULL,
    "kod" TEXT NOT NULL,
    "aciklama" TEXT,
    "agirlik" DOUBLE PRECISION,
    "boyut" TEXT,
    "malzeme" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TepsiTava_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kutu" (
    "id" SERIAL NOT NULL,
    "ad" TEXT NOT NULL,
    "kod" TEXT NOT NULL,
    "aciklama" TEXT,
    "fiyat" DOUBLE PRECISION DEFAULT 0,
    "agirlik" DOUBLE PRECISION,
    "boyutlar" JSONB,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kutu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cari" (
    "id" SERIAL NOT NULL,
    "ad" TEXT NOT NULL,
    "soyad" TEXT,
    "musteriKodu" TEXT NOT NULL,
    "telefon" TEXT,
    "email" TEXT,
    "adres" TEXT,
    "il" TEXT,
    "ilce" TEXT,
    "postaKodu" TEXT,
    "cariGrubu" TEXT,
    "fiyatGrubu" TEXT,
    "irtibatAdi" TEXT,
    "subeAdi" TEXT,
    "tipi" "CariTipi" NOT NULL DEFAULT 'MUSTERI',
    "vergiNo" TEXT,
    "vergiDairesi" TEXT,
    "krediLimiti" DOUBLE PRECISION DEFAULT 0,
    "riskLimiti" DOUBLE PRECISION DEFAULT 0,
    "bakiye" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastModifiedBy" TEXT,
    "lastModifiedAt" TIMESTAMP(3),
    "lastAction" TEXT,

    CONSTRAINT "Cari_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CariAdres" (
    "id" SERIAL NOT NULL,
    "cariMusteriId" INTEGER,
    "tip" "AdresTipi" NOT NULL DEFAULT 'DIGER',
    "adres" TEXT NOT NULL,
    "il" TEXT,
    "ilce" TEXT,
    "mahalle" TEXT,
    "postaKodu" TEXT,
    "tarif" TEXT,
    "varsayilan" BOOLEAN NOT NULL DEFAULT false,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CariAdres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CariMusteri" (
    "id" SERIAL NOT NULL,
    "cariAdi" TEXT NOT NULL,
    "musteriKodu" TEXT NOT NULL,
    "subeAdi" TEXT,
    "telefon" TEXT,
    "irtibatAdi" TEXT,
    "cariGrubu" TEXT,
    "fiyatGrubu" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CariMusteri_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeslimatTuru" (
    "id" SERIAL NOT NULL,
    "ad" TEXT NOT NULL,
    "kod" TEXT NOT NULL,
    "aciklama" TEXT,
    "varsayilanKargo" DOUBLE PRECISION DEFAULT 0,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeslimatTuru_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Siparis" (
    "id" SERIAL NOT NULL,
    "siparisNo" TEXT NOT NULL,
    "tarih" TIMESTAMP(3) NOT NULL,
    "teslimTarihi" TIMESTAMP(3),
    "teslimSaati" TEXT,
    "cariId" INTEGER,
    "gonderenAdi" TEXT NOT NULL,
    "gonderenTel" TEXT NOT NULL,
    "gonderenEmail" TEXT,
    "aliciAdi" TEXT,
    "aliciTel" TEXT,
    "aliciEmail" TEXT,
    "teslimatAdresi" TEXT,
    "il" TEXT,
    "ilce" TEXT,
    "postaKodu" TEXT,
    "teslimatTuruId" INTEGER NOT NULL,
    "subeId" INTEGER,
    "araToplam" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kdvToplam" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kargoUcreti" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "digerHizmetTutari" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "toplamTutar" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "toplamMaliyet" DOUBLE PRECISION DEFAULT 0,
    "karMarji" DOUBLE PRECISION DEFAULT 0,
    "karOrani" DOUBLE PRECISION DEFAULT 0,
    "maliyetGuncellemeTarihi" TIMESTAMP(3),
    "indirimTutari" DOUBLE PRECISION DEFAULT 0,
    "indirimSebebi" TEXT,
    "durum" "SiparisDurumu" NOT NULL DEFAULT 'ONAY_BEKLEYEN',
    "kargoDurumu" "KargoDurumu" NOT NULL DEFAULT 'ADRESE_TESLIMAT',
    "odemeDurumu" TEXT DEFAULT 'bekliyor',
    "kargoSirketi" TEXT,
    "kargoTakipNo" TEXT,
    "kargoNotu" TEXT,
    "kargoTarihi" TIMESTAMP(3),
    "hedefSubeId" INTEGER,
    "subeNeredenId" INTEGER,
    "subeNereyeId" INTEGER,
    "siparisNotu" TEXT,
    "ozelTalepler" TEXT,
    "dahiliNotlar" TEXT,
    "oncelik" "OncelikSeviyesi" NOT NULL DEFAULT 'NORMAL',
    "acilmi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER,
    "onaylayanId" INTEGER,
    "onaylanmaTarihi" TIMESTAMP(3),
    "lastModifiedBy" TEXT,
    "lastModifiedAt" TIMESTAMP(3),
    "lastAction" TEXT,

    CONSTRAINT "Siparis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiparisKalemi" (
    "id" SERIAL NOT NULL,
    "siparisId" INTEGER NOT NULL,
    "urunId" INTEGER NOT NULL,
    "urunAdi" TEXT NOT NULL,
    "urunKodu" TEXT,
    "miktar" DOUBLE PRECISION NOT NULL,
    "birim" "SatisBirimi" NOT NULL,
    "birimFiyat" DOUBLE PRECISION NOT NULL,
    "kdvOrani" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "iskonto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "araToplam" DOUBLE PRECISION NOT NULL,
    "kdvTutari" DOUBLE PRECISION NOT NULL,
    "toplamTutar" DOUBLE PRECISION NOT NULL,
    "birimMaliyet" DOUBLE PRECISION DEFAULT 0,
    "toplamMaliyet" DOUBLE PRECISION DEFAULT 0,
    "karMarji" DOUBLE PRECISION DEFAULT 0,
    "karOrani" DOUBLE PRECISION DEFAULT 0,
    "tepsiTavaId" INTEGER,
    "kutuId" INTEGER,
    "uretimNotu" TEXT,

    CONSTRAINT "SiparisKalemi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" SERIAL NOT NULL,
    "ad" TEXT NOT NULL,
    "kod" TEXT NOT NULL,
    "tipi" "MaterialTipi" NOT NULL,
    "birim" "MaterialBirimi" NOT NULL DEFAULT 'KG',
    "birimFiyat" DOUBLE PRECISION DEFAULT 0,
    "mevcutStok" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStokSeviye" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxStokSeviye" DOUBLE PRECISION,
    "kritikSeviye" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "aciklama" TEXT,
    "tedarikci" TEXT,
    "rafOmru" INTEGER,
    "saklamaKosullari" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastModifiedBy" TEXT,
    "lastModifiedAt" TIMESTAMP(3),
    "lastAction" TEXT,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" SERIAL NOT NULL,
    "ad" TEXT NOT NULL,
    "kod" TEXT NOT NULL,
    "urunId" INTEGER,
    "aciklama" TEXT,
    "porsiyon" DOUBLE PRECISION DEFAULT 1,
    "hazirlamaSuresi" INTEGER,
    "pisirmeSuresi" INTEGER,
    "hazirlanisi" JSONB,
    "notlar" TEXT,
    "toplamMaliyet" DOUBLE PRECISION DEFAULT 0,
    "birimMaliyet" DOUBLE PRECISION DEFAULT 0,
    "guncellemeTarihi" TIMESTAMP(3),
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "versiyon" TEXT NOT NULL DEFAULT '1.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER,
    "lastModifiedBy" TEXT,
    "lastModifiedAt" TIMESTAMP(3),
    "lastAction" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" SERIAL NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "miktar" DOUBLE PRECISION NOT NULL,
    "birim" "MaterialBirimi" NOT NULL,
    "fire1" DOUBLE PRECISION DEFAULT 0,
    "fire2" DOUBLE PRECISION DEFAULT 0,
    "gerMiktar" DOUBLE PRECISION DEFAULT 0,
    "gerMiktarTB" DOUBLE PRECISION DEFAULT 0,
    "sonFiyat" DOUBLE PRECISION DEFAULT 0,
    "maliyet" DOUBLE PRECISION DEFAULT 0,
    "hazirlamaNotu" TEXT,
    "zorunlu" BOOLEAN NOT NULL DEFAULT true,
    "alternatifOlabilir" BOOLEAN NOT NULL DEFAULT false,
    "siraNo" INTEGER,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StokHareket" (
    "id" SERIAL NOT NULL,
    "urunId" INTEGER,
    "materialId" INTEGER,
    "tip" "StokHareketTipi" NOT NULL,
    "miktar" DOUBLE PRECISION NOT NULL,
    "birim" TEXT NOT NULL,
    "birimMaliyet" DOUBLE PRECISION DEFAULT 0,
    "toplamMaliyet" DOUBLE PRECISION DEFAULT 0,
    "siparisKalemiId" INTEGER,
    "transferId" INTEGER,
    "aciklama" TEXT,
    "referansNo" TEXT,
    "oncekiStok" DOUBLE PRECISION,
    "sonrakiStok" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,

    CONSTRAINT "StokHareket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StokTransfer" (
    "id" SERIAL NOT NULL,
    "transferNo" TEXT NOT NULL,
    "kaynakSubeId" INTEGER,
    "hedefSubeId" INTEGER,
    "urunId" INTEGER,
    "materialId" INTEGER,
    "miktar" DOUBLE PRECISION NOT NULL,
    "birim" TEXT NOT NULL,
    "aciklama" TEXT,
    "birimMaliyet" DOUBLE PRECISION DEFAULT 0,
    "toplamMaliyet" DOUBLE PRECISION DEFAULT 0,
    "durum" "TransferDurumu" NOT NULL DEFAULT 'BEKLIYOR',
    "gonderimTarihi" TIMESTAMP(3),
    "teslimTarihi" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    "gonderenId" INTEGER,
    "teslimAlanId" INTEGER,

    CONSTRAINT "StokTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CariHareket" (
    "id" SERIAL NOT NULL,
    "cariMusteriId" INTEGER NOT NULL,
    "tip" "HareketTipi" NOT NULL,
    "tutar" DOUBLE PRECISION NOT NULL,
    "aciklama" TEXT,
    "siparisId" INTEGER,
    "odemeId" INTEGER,
    "belgeNo" TEXT,
    "belgeTarihi" TIMESTAMP(3),
    "oncekiBakiye" DOUBLE PRECISION,
    "sonrakiBakiye" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,

    CONSTRAINT "CariHareket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CariOdeme" (
    "id" SERIAL NOT NULL,
    "cariMusteriId" INTEGER NOT NULL,
    "tutar" DOUBLE PRECISION NOT NULL,
    "odemeYontemi" "OdemeYontemi" NOT NULL,
    "aciklama" TEXT,
    "siparisId" INTEGER,
    "odemeTarihi" TIMESTAMP(3) NOT NULL,
    "vadeTarihi" TIMESTAMP(3),
    "bankaAdi" TEXT,
    "hesapNo" TEXT,
    "cekNo" TEXT,
    "cekTarihi" TIMESTAMP(3),
    "durum" "OdemeDurumu" NOT NULL DEFAULT 'ODENDI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,

    CONSTRAINT "CariOdeme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "personelId" TEXT,
    "action" "AuditAction" NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "description" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "sessionId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "dataType" "SettingDataType" NOT NULL DEFAULT 'STRING',
    "category" TEXT,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" INTEGER,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_personelId_key" ON "User"("personelId");

-- CreateIndex
CREATE INDEX "User_subeId_idx" ON "User"("subeId");

-- CreateIndex
CREATE INDEX "User_rol_idx" ON "User"("rol");

-- CreateIndex
CREATE INDEX "User_aktif_idx" ON "User"("aktif");

-- CreateIndex
CREATE UNIQUE INDEX "Sube_ad_key" ON "Sube"("ad");

-- CreateIndex
CREATE UNIQUE INDEX "Sube_kod_key" ON "Sube"("kod");

-- CreateIndex
CREATE INDEX "Sube_kod_idx" ON "Sube"("kod");

-- CreateIndex
CREATE INDEX "Sube_tip_idx" ON "Sube"("tip");

-- CreateIndex
CREATE INDEX "Sube_aktif_idx" ON "Sube"("aktif");

-- CreateIndex
CREATE UNIQUE INDEX "UrunKategori_ad_key" ON "UrunKategori"("ad");

-- CreateIndex
CREATE UNIQUE INDEX "UrunKategori_kod_key" ON "UrunKategori"("kod");

-- CreateIndex
CREATE INDEX "UrunKategori_aktif_idx" ON "UrunKategori"("aktif");

-- CreateIndex
CREATE UNIQUE INDEX "Urun_ad_key" ON "Urun"("ad");

-- CreateIndex
CREATE UNIQUE INDEX "Urun_kod_key" ON "Urun"("kod");

-- CreateIndex
CREATE INDEX "Urun_kategoriId_idx" ON "Urun"("kategoriId");

-- CreateIndex
CREATE INDEX "Urun_kod_idx" ON "Urun"("kod");

-- CreateIndex
CREATE INDEX "Urun_aktif_idx" ON "Urun"("aktif");

-- CreateIndex
CREATE INDEX "Urun_satisaUygun_idx" ON "Urun"("satisaUygun");

-- CreateIndex
CREATE INDEX "UrunFiyat_aktif_idx" ON "UrunFiyat"("aktif");

-- CreateIndex
CREATE INDEX "UrunFiyat_baslangicTarihi_idx" ON "UrunFiyat"("baslangicTarihi");

-- CreateIndex
CREATE INDEX "UrunFiyat_bitisTarihi_idx" ON "UrunFiyat"("bitisTarihi");

-- CreateIndex
CREATE UNIQUE INDEX "UrunFiyat_urunId_baslangicTarihi_fiyatTipi_key" ON "UrunFiyat"("urunId", "baslangicTarihi", "fiyatTipi");

-- CreateIndex
CREATE INDEX "TepsiFiyat_aktif_idx" ON "TepsiFiyat"("aktif");

-- CreateIndex
CREATE INDEX "TepsiFiyat_baslangicTarihi_idx" ON "TepsiFiyat"("baslangicTarihi");

-- CreateIndex
CREATE UNIQUE INDEX "TepsiFiyat_tepsiTavaId_baslangicTarihi_fiyatTipi_key" ON "TepsiFiyat"("tepsiTavaId", "baslangicTarihi", "fiyatTipi");

-- CreateIndex
CREATE UNIQUE INDEX "TepsiTava_ad_key" ON "TepsiTava"("ad");

-- CreateIndex
CREATE UNIQUE INDEX "TepsiTava_kod_key" ON "TepsiTava"("kod");

-- CreateIndex
CREATE INDEX "TepsiTava_kod_idx" ON "TepsiTava"("kod");

-- CreateIndex
CREATE INDEX "TepsiTava_aktif_idx" ON "TepsiTava"("aktif");

-- CreateIndex
CREATE UNIQUE INDEX "Kutu_ad_key" ON "Kutu"("ad");

-- CreateIndex
CREATE UNIQUE INDEX "Kutu_kod_key" ON "Kutu"("kod");

-- CreateIndex
CREATE INDEX "Kutu_kod_idx" ON "Kutu"("kod");

-- CreateIndex
CREATE INDEX "Kutu_aktif_idx" ON "Kutu"("aktif");

-- CreateIndex
CREATE UNIQUE INDEX "Cari_musteriKodu_key" ON "Cari"("musteriKodu");

-- CreateIndex
CREATE INDEX "Cari_musteriKodu_idx" ON "Cari"("musteriKodu");

-- CreateIndex
CREATE INDEX "Cari_tipi_idx" ON "Cari"("tipi");

-- CreateIndex
CREATE INDEX "Cari_aktif_idx" ON "Cari"("aktif");

-- CreateIndex
CREATE INDEX "CariAdres_cariMusteriId_idx" ON "CariAdres"("cariMusteriId");

-- CreateIndex
CREATE INDEX "CariAdres_tip_idx" ON "CariAdres"("tip");

-- CreateIndex
CREATE INDEX "CariAdres_varsayilan_idx" ON "CariAdres"("varsayilan");

-- CreateIndex
CREATE UNIQUE INDEX "CariMusteri_musteriKodu_key" ON "CariMusteri"("musteriKodu");

-- CreateIndex
CREATE INDEX "CariMusteri_musteriKodu_idx" ON "CariMusteri"("musteriKodu");

-- CreateIndex
CREATE INDEX "CariMusteri_subeAdi_idx" ON "CariMusteri"("subeAdi");

-- CreateIndex
CREATE INDEX "CariMusteri_aktif_idx" ON "CariMusteri"("aktif");

-- CreateIndex
CREATE UNIQUE INDEX "TeslimatTuru_ad_key" ON "TeslimatTuru"("ad");

-- CreateIndex
CREATE UNIQUE INDEX "TeslimatTuru_kod_key" ON "TeslimatTuru"("kod");

-- CreateIndex
CREATE INDEX "TeslimatTuru_kod_idx" ON "TeslimatTuru"("kod");

-- CreateIndex
CREATE INDEX "TeslimatTuru_aktif_idx" ON "TeslimatTuru"("aktif");

-- CreateIndex
CREATE UNIQUE INDEX "Siparis_siparisNo_key" ON "Siparis"("siparisNo");

-- CreateIndex
CREATE INDEX "Siparis_durum_idx" ON "Siparis"("durum");

-- CreateIndex
CREATE INDEX "Siparis_kargoDurumu_idx" ON "Siparis"("kargoDurumu");

-- CreateIndex
CREATE INDEX "Siparis_cariId_idx" ON "Siparis"("cariId");

-- CreateIndex
CREATE INDEX "Siparis_tarih_idx" ON "Siparis"("tarih");

-- CreateIndex
CREATE INDEX "Siparis_createdAt_idx" ON "Siparis"("createdAt");

-- CreateIndex
CREATE INDEX "Siparis_toplamMaliyet_idx" ON "Siparis"("toplamMaliyet");

-- CreateIndex
CREATE INDEX "SiparisKalemi_siparisId_idx" ON "SiparisKalemi"("siparisId");

-- CreateIndex
CREATE INDEX "SiparisKalemi_urunId_idx" ON "SiparisKalemi"("urunId");

-- CreateIndex
CREATE INDEX "SiparisKalemi_birimMaliyet_idx" ON "SiparisKalemi"("birimMaliyet");

-- CreateIndex
CREATE UNIQUE INDEX "Material_ad_key" ON "Material"("ad");

-- CreateIndex
CREATE UNIQUE INDEX "Material_kod_key" ON "Material"("kod");

-- CreateIndex
CREATE INDEX "Material_kod_idx" ON "Material"("kod");

-- CreateIndex
CREATE INDEX "Material_tipi_idx" ON "Material"("tipi");

-- CreateIndex
CREATE INDEX "Material_aktif_idx" ON "Material"("aktif");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_ad_key" ON "Recipe"("ad");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_kod_key" ON "Recipe"("kod");

-- CreateIndex
CREATE INDEX "Recipe_aktif_idx" ON "Recipe"("aktif");

-- CreateIndex
CREATE INDEX "Recipe_urunId_idx" ON "Recipe"("urunId");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_urunId_versiyon_key" ON "Recipe"("urunId", "versiyon");

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_idx" ON "RecipeIngredient"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeIngredient_materialId_idx" ON "RecipeIngredient"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_materialId_key" ON "RecipeIngredient"("recipeId", "materialId");

-- CreateIndex
CREATE INDEX "StokHareket_tip_idx" ON "StokHareket"("tip");

-- CreateIndex
CREATE INDEX "StokHareket_urunId_idx" ON "StokHareket"("urunId");

-- CreateIndex
CREATE INDEX "StokHareket_materialId_idx" ON "StokHareket"("materialId");

-- CreateIndex
CREATE INDEX "StokHareket_createdAt_idx" ON "StokHareket"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StokTransfer_transferNo_key" ON "StokTransfer"("transferNo");

-- CreateIndex
CREATE INDEX "StokTransfer_durum_idx" ON "StokTransfer"("durum");

-- CreateIndex
CREATE INDEX "StokTransfer_kaynakSubeId_idx" ON "StokTransfer"("kaynakSubeId");

-- CreateIndex
CREATE INDEX "StokTransfer_hedefSubeId_idx" ON "StokTransfer"("hedefSubeId");

-- CreateIndex
CREATE INDEX "CariHareket_cariMusteriId_idx" ON "CariHareket"("cariMusteriId");

-- CreateIndex
CREATE INDEX "CariHareket_tip_idx" ON "CariHareket"("tip");

-- CreateIndex
CREATE INDEX "CariHareket_createdAt_idx" ON "CariHareket"("createdAt");

-- CreateIndex
CREATE INDEX "CariOdeme_cariMusteriId_idx" ON "CariOdeme"("cariMusteriId");

-- CreateIndex
CREATE INDEX "CariOdeme_odemeYontemi_idx" ON "CariOdeme"("odemeYontemi");

-- CreateIndex
CREATE INDEX "CariOdeme_durum_idx" ON "CariOdeme"("durum");

-- CreateIndex
CREATE INDEX "CariOdeme_odemeTarihi_idx" ON "CariOdeme"("odemeTarihi");

-- CreateIndex
CREATE INDEX "AuditLog_personelId_idx" ON "AuditLog"("personelId");

-- CreateIndex
CREATE INDEX "AuditLog_tableName_idx" ON "AuditLog"("tableName");

-- CreateIndex
CREATE INDEX "AuditLog_recordId_idx" ON "AuditLog"("recordId");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_subeId_fkey" FOREIGN KEY ("subeId") REFERENCES "Sube"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Urun" ADD CONSTRAINT "Urun_kategoriId_fkey" FOREIGN KEY ("kategoriId") REFERENCES "UrunKategori"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Urun" ADD CONSTRAINT "Urun_lastModifiedBy_fkey" FOREIGN KEY ("lastModifiedBy") REFERENCES "User"("personelId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UrunFiyat" ADD CONSTRAINT "UrunFiyat_urunId_fkey" FOREIGN KEY ("urunId") REFERENCES "Urun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TepsiFiyat" ADD CONSTRAINT "TepsiFiyat_tepsiTavaId_fkey" FOREIGN KEY ("tepsiTavaId") REFERENCES "TepsiTava"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cari" ADD CONSTRAINT "Cari_lastModifiedBy_fkey" FOREIGN KEY ("lastModifiedBy") REFERENCES "User"("personelId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CariAdres" ADD CONSTRAINT "CariAdres_cariMusteriId_fkey" FOREIGN KEY ("cariMusteriId") REFERENCES "CariMusteri"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Siparis" ADD CONSTRAINT "Siparis_cariId_fkey" FOREIGN KEY ("cariId") REFERENCES "CariMusteri"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Siparis" ADD CONSTRAINT "Siparis_teslimatTuruId_fkey" FOREIGN KEY ("teslimatTuruId") REFERENCES "TeslimatTuru"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Siparis" ADD CONSTRAINT "Siparis_subeId_fkey" FOREIGN KEY ("subeId") REFERENCES "Sube"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Siparis" ADD CONSTRAINT "Siparis_hedefSubeId_fkey" FOREIGN KEY ("hedefSubeId") REFERENCES "Sube"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Siparis" ADD CONSTRAINT "Siparis_subeNeredenId_fkey" FOREIGN KEY ("subeNeredenId") REFERENCES "Sube"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Siparis" ADD CONSTRAINT "Siparis_subeNereyeId_fkey" FOREIGN KEY ("subeNereyeId") REFERENCES "Sube"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Siparis" ADD CONSTRAINT "Siparis_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Siparis" ADD CONSTRAINT "Siparis_onaylayanId_fkey" FOREIGN KEY ("onaylayanId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Siparis" ADD CONSTRAINT "Siparis_lastModifiedBy_fkey" FOREIGN KEY ("lastModifiedBy") REFERENCES "User"("personelId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiparisKalemi" ADD CONSTRAINT "SiparisKalemi_siparisId_fkey" FOREIGN KEY ("siparisId") REFERENCES "Siparis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiparisKalemi" ADD CONSTRAINT "SiparisKalemi_urunId_fkey" FOREIGN KEY ("urunId") REFERENCES "Urun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiparisKalemi" ADD CONSTRAINT "SiparisKalemi_tepsiTavaId_fkey" FOREIGN KEY ("tepsiTavaId") REFERENCES "TepsiTava"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiparisKalemi" ADD CONSTRAINT "SiparisKalemi_kutuId_fkey" FOREIGN KEY ("kutuId") REFERENCES "Kutu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_lastModifiedBy_fkey" FOREIGN KEY ("lastModifiedBy") REFERENCES "User"("personelId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_urunId_fkey" FOREIGN KEY ("urunId") REFERENCES "Urun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_lastModifiedBy_fkey" FOREIGN KEY ("lastModifiedBy") REFERENCES "User"("personelId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StokHareket" ADD CONSTRAINT "StokHareket_urunId_fkey" FOREIGN KEY ("urunId") REFERENCES "Urun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StokHareket" ADD CONSTRAINT "StokHareket_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StokHareket" ADD CONSTRAINT "StokHareket_siparisKalemiId_fkey" FOREIGN KEY ("siparisKalemiId") REFERENCES "SiparisKalemi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StokHareket" ADD CONSTRAINT "StokHareket_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StokTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StokHareket" ADD CONSTRAINT "StokHareket_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StokTransfer" ADD CONSTRAINT "StokTransfer_kaynakSubeId_fkey" FOREIGN KEY ("kaynakSubeId") REFERENCES "Sube"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StokTransfer" ADD CONSTRAINT "StokTransfer_hedefSubeId_fkey" FOREIGN KEY ("hedefSubeId") REFERENCES "Sube"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StokTransfer" ADD CONSTRAINT "StokTransfer_urunId_fkey" FOREIGN KEY ("urunId") REFERENCES "Urun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StokTransfer" ADD CONSTRAINT "StokTransfer_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StokTransfer" ADD CONSTRAINT "StokTransfer_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StokTransfer" ADD CONSTRAINT "StokTransfer_gonderenId_fkey" FOREIGN KEY ("gonderenId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StokTransfer" ADD CONSTRAINT "StokTransfer_teslimAlanId_fkey" FOREIGN KEY ("teslimAlanId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CariHareket" ADD CONSTRAINT "CariHareket_cariMusteriId_fkey" FOREIGN KEY ("cariMusteriId") REFERENCES "CariMusteri"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CariHareket" ADD CONSTRAINT "CariHareket_siparisId_fkey" FOREIGN KEY ("siparisId") REFERENCES "Siparis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CariHareket" ADD CONSTRAINT "CariHareket_odemeId_fkey" FOREIGN KEY ("odemeId") REFERENCES "CariOdeme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CariHareket" ADD CONSTRAINT "CariHareket_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CariOdeme" ADD CONSTRAINT "CariOdeme_cariMusteriId_fkey" FOREIGN KEY ("cariMusteriId") REFERENCES "CariMusteri"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CariOdeme" ADD CONSTRAINT "CariOdeme_siparisId_fkey" FOREIGN KEY ("siparisId") REFERENCES "Siparis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CariOdeme" ADD CONSTRAINT "CariOdeme_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_personelId_fkey" FOREIGN KEY ("personelId") REFERENCES "User"("personelId") ON DELETE SET NULL ON UPDATE CASCADE;
