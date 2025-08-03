import prisma from '../../../../lib/prisma.js';
// import { verifyAuth } from '../../../../lib/auth'; // GELİŞTİRME İÇİN GEÇİCİ OLARAK KAPALI

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ message: 'Personel ID zorunludur.' });
    }

    // DELETE - Personel sil
    if (req.method === 'DELETE') {
        try {
            // Auth kontrolü - GELİŞTİRME İÇİN GEÇİCİ OLARAK KAPALI
            // let currentUser;
            // try {
            //     currentUser = verifyAuth(req);
            //     if (!['GENEL_MUDUR'].includes(currentUser.rol)) {
            //         return res.status(403).json({ message: 'Personel silme yetkiniz yok.' });
            //     }
            // } catch (e) {
            //     return res.status(401).json({ message: 'Yetkisiz erişim.' });
            // }

            // Personeli sil
            await prisma.user.delete({
                where: { id: parseInt(id) }
            });

            return res.status(200).json({ message: 'Personel başarıyla silindi.' });
        } catch (error) {
            console.error('Personel DELETE hatası:', error);
            if (error.code === 'P2025') {
                return res.status(404).json({ message: 'Personel bulunamadı.' });
            }
            return res.status(500).json({
                message: 'Personel silinirken hata oluştu.',
                error: error.message
            });
        }
    }

    // PUT - Personel güncelle  
    if (req.method === 'PUT') {
        try {
            // Auth kontrolü - GELİŞTİRME İÇİN GEÇİCİ OLARAK KAPALI
            // let currentUser;
            // try {
            //     currentUser = verifyAuth(req);
            //     if (!['GENEL_MUDUR', 'SUBE_MUDURU'].includes(currentUser.rol)) {
            //         return res.status(403).json({ message: 'Personel güncelleme yetkiniz yok.' });
            //     }
            // } catch (e) {
            //     return res.status(401).json({ message: 'Yetkisiz erişim.' });
            // }

            const {
                ad,
                soyad,
                email,
                username,
                password,
                rol,
                telefon,
                subeId,
                bolum,
                unvan,
                iseBaslamaTarihi,
                gunlukUcret,
                sgkDurumu,
                aktif
            } = req.body;

            // Güncellenecek veriyi hazırla
            const updateData = {
                ad,
                soyad,
                email,
                username,
                rol,
                telefon,
                subeId: subeId ? parseInt(subeId) : null,
                bolum,
                unvan,
                iseBaslamaTarihi: iseBaslamaTarihi ? new Date(iseBaslamaTarihi) : null,
                gunlukUcret: gunlukUcret ? parseFloat(gunlukUcret) : 0,
                sgkDurumu: sgkDurumu || 'VAR',
                aktif: aktif !== undefined ? aktif : true,
                updatedBy: 1 // Geçici olarak admin user ID
            };

            // Giriş yılını güncelle
            if (iseBaslamaTarihi) {
                updateData.girisYili = new Date(iseBaslamaTarihi).getFullYear();
            }

            // Eğer şifre verilmişse hash'le
            if (password && password.trim() !== '') {
                const bcrypt = require('bcrypt');
                updateData.passwordHash = await bcrypt.hash(password, 12);
            }

            // Email uniqueness kontrolü (kendi kaydı hariç)
            if (email) {
                const existingEmail = await prisma.user.findFirst({
                    where: {
                        email,
                        id: { not: parseInt(id) }
                    }
                });
                if (existingEmail) {
                    return res.status(400).json({
                        message: 'Bu email adresi zaten kullanımda.'
                    });
                }
            }

            // Username uniqueness kontrolü (kendi kaydı hariç)
            if (username) {
                const existingUsername = await prisma.user.findFirst({
                    where: {
                        username,
                        id: { not: parseInt(id) }
                    }
                });
                if (existingUsername) {
                    return res.status(400).json({
                        message: 'Bu kullanıcı adı zaten kullanımda.'
                    });
                }
            }

            const updatedUser = await prisma.user.update({
                where: { id: parseInt(id) },
                data: updateData,
                select: {
                    id: true,
                    ad: true,
                    soyad: true,
                    email: true,
                    username: true,
                    rol: true,
                    telefon: true,
                    aktif: true,
                    subeId: true,
                    sube: {
                        select: { ad: true, kod: true }
                    },
                    bolum: true,
                    unvan: true,
                    iseBaslamaTarihi: true,
                    gunlukUcret: true,
                    sgkDurumu: true,
                    girisYili: true,
                    updatedAt: true
                }
            });

            return res.status(200).json(updatedUser);
        } catch (error) {
            console.error('Personel PUT hatası:', error);
            if (error.code === 'P2025') {
                return res.status(404).json({ message: 'Personel bulunamadı.' });
            }
            return res.status(500).json({
                message: 'Personel güncellenirken hata oluştu.',
                error: error.message
            });
        }
    }

    return res.status(405).json({ message: 'İzin verilmeyen HTTP metodu.' });
} 