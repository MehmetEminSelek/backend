import XLSX from 'xlsx';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Şablon başlıkları - CSV ile aynı
    const headers = [
        'CARİ ADI',          // Zorunlu
        'CARİ GRUBU',        // Opsiyonel
        'FİYAT GRUBU',       // Opsiyonel
        'MÜŞTERİ KODU',      // Otomatik veya manuel (MS000001 formatında)
        'ŞUBE ADI',          // Opsiyonel
        'İRTİBAT ADI',       // Opsiyonel
        'TEL'                // Opsiyonel
    ];

    // Örnek veri satırları (kullanıcıya yardımcı olması için)
    const exampleData = [
        [
            'Örnek Müşteri A.Ş.',  // CARİ ADI
            'Kurumsal',             // CARİ GRUBU
            'Toptan',               // FİYAT GRUBU
            '',                     // MÜŞTERİ KODU (boş bırakılırsa otomatik atanır)
            'SALON',                // ŞUBE ADI
            'Ali Veli',             // İRTİBAT ADI
            '5551234567'            // TEL
        ]
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);

    // Kolon genişliklerini ayarla
    ws['!cols'] = [
        { wch: 30 }, // CARİ ADI
        { wch: 15 }, // CARİ GRUBU
        { wch: 15 }, // FİYAT GRUBU
        { wch: 15 }, // MÜŞTERİ KODU
        { wch: 15 }, // ŞUBE ADI
        { wch: 20 }, // İRTİBAT ADI
        { wch: 15 }  // TEL
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cariler');

    // Açıklama sayfası ekle
    const notesHeaders = ['ALAN ADI', 'ZORUNLU', 'AÇIKLAMA'];
    const notesData = [
        ['CARİ ADI', 'EVET', 'Müşteri veya tedarikçinin tam adı'],
        ['CARİ GRUBU', 'HAYIR', 'Müşteri grubu (opsiyonel)'],
        ['FİYAT GRUBU', 'HAYIR', 'Fiyat grubu (opsiyonel)'],
        ['MÜŞTERİ KODU', 'HAYIR', 'Boş bırakılırsa otomatik atanır (MS000001 formatında)'],
        ['ŞUBE ADI', 'HAYIR', 'İlgili şube adı (boş ise SALON atanır)'],
        ['İRTİBAT ADI', 'HAYIR', 'İletişim kurulacak kişi'],
        ['TEL', 'HAYIR', 'Telefon numarası']
    ];

    const wsNotes = XLSX.utils.aoa_to_sheet([notesHeaders, ...notesData]);
    wsNotes['!cols'] = [
        { wch: 20 },
        { wch: 10 },
        { wch: 60 }
    ];

    XLSX.utils.book_append_sheet(wb, wsNotes, 'Açıklamalar');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="cari-sablon.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
} 