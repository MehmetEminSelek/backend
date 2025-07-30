import formidable from 'formidable';
import XLSX from 'xlsx';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const parseForm = (req) => {
    const form = formidable({});
    return new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
            if (err) reject(err);
            else resolve({ fields, files });
        });
    });
};

const cleanRow = (row) => {
    const clean = {};
    Object.keys(row).forEach(k => { clean[k.trim()] = row[k]; });
    return clean;
};

// Yeni müşteri kodu oluştur
async function generateNextMusteriKodu() {
    // En son müşteri kodunu bul
    const lastCari = await prisma.cari.findFirst({
        where: {
            musteriKodu: {
                startsWith: 'MS'
            }
        },
        orderBy: {
            musteriKodu: 'desc'
        }
    });

    if (!lastCari) {
        return 'MS000001';
    }

    // MS000001 formatından sayıyı çıkar
    const lastNumber = parseInt(lastCari.musteriKodu.substring(2));
    const nextNumber = lastNumber + 1;

    // Yeni kodu oluştur (6 hane, başında sıfırlar)
    return `MS${String(nextNumber).padStart(6, '0')}`;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let fields, files;
    try {
        ({ fields, files } = await parseForm(req));
    } catch (err) {
        return res.status(500).json({ error: 'Dosya yüklenemedi.' });
    }

    let file = files.file;
    if (Array.isArray(file)) file = file[0];

    if (!file) {
        return res.status(400).json({ error: 'Excel dosyası gerekli.' });
    }

    const filePath = file.filepath || file.path;
    let workbook;

    try {
        const fileBuffer = fs.readFileSync(filePath);
        workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    } catch (e) {
        console.error('XLSX read error:', e);
        return res.status(400).json({ error: 'Excel dosyası okunamadı.' });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rowsRaw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    // Zorunlu alanları kontrol et (sadece CARİ ADI zorunlu)
    if (rowsRaw.length === 0 || !rowsRaw[0]['CARİ ADI']) {
        return res.status(400).json({ error: 'Excel dosyasında CARİ ADI başlığı bulunamadı.' });
    }

    const results = [];

    for (const rowRaw of rowsRaw) {
        const rec = cleanRow(rowRaw);

        // Zorunlu alan kontrolü
        if (!rec['CARİ ADI'] || rec['CARİ ADI'].trim() === '') {
            results.push({
                musteriKodu: rec['MÜŞTERİ KODU'] || 'YOK',
                ad: rec['CARİ ADI'] || 'YOK',
                status: 'error',
                message: 'CARİ ADI zorunludur.'
            });
            continue;
        }

        const ad = rec['CARİ ADI'].trim();
        let musteriKodu = rec['MÜŞTERİ KODU']?.trim();

        // Müşteri kodu yoksa otomatik oluştur
        if (!musteriKodu) {
            musteriKodu = await generateNextMusteriKodu();
        }

        // CSV'deki alanları al
        const cariGrubu = rec['CARİ GRUBU']?.trim() || null;
        const fiyatGrubu = rec['FİYAT GRUBU']?.trim() || null;
        const subeAdi = rec['ŞUBE ADI']?.trim() || 'SALON';
        const irtibatAdi = rec['İRTİBAT ADI']?.trim() || null;
        const telefon = rec['TEL']?.toString().trim() || null;

        try {
            // Unique constraint için önce var mı bak
            const existing = await prisma.cari.findUnique({ where: { musteriKodu } });

            if (!existing) {
                // Yeni kayıt oluştur
                await prisma.cari.create({
                    data: {
                        ad,
                        musteriKodu,
                        cariGrubu,
                        fiyatGrubu,
                        subeAdi,
                        irtibatAdi,
                        telefon,
                        tipi: 'MUSTERI' // Default olarak müşteri
                    }
                });

                results.push({
                    musteriKodu,
                    ad,
                    status: 'ok',
                    message: rec['MÜŞTERİ KODU'] ? null : 'Müşteri kodu otomatik oluşturuldu'
                });
            } else {
                // Mevcut kaydı güncelle (sadece boş olmayan alanları güncelle)
                const updateData = {};

                if (cariGrubu !== null) updateData.cariGrubu = cariGrubu;
                if (fiyatGrubu !== null) updateData.fiyatGrubu = fiyatGrubu;
                if (subeAdi !== 'SALON') updateData.subeAdi = subeAdi;
                if (irtibatAdi !== null) updateData.irtibatAdi = irtibatAdi;
                if (telefon !== null) updateData.telefon = telefon;

                // Ad her zaman güncellenir
                updateData.ad = ad;

                await prisma.cari.update({
                    where: { musteriKodu },
                    data: updateData
                });

                results.push({
                    musteriKodu,
                    ad,
                    status: 'updated',
                    message: 'Mevcut kayıt güncellendi.'
                });
            }
        } catch (error) {
            console.error('Cari kayıt hatası:', error);
            results.push({
                musteriKodu,
                ad,
                status: 'error',
                message: error.message
            });
        }
    }

    return res.status(200).json({ results });
} 