/**
 * Simple Login Handler
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { publicEndpoint } from '../../../lib/simple-auth.js';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

async function loginHandler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            error: 'Email ve şifre gerekli'
        });
    }

    try {
        // Kullanıcıyı bul
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: email.toLowerCase() },
                    { username: email.toLowerCase() }
                ]
            }
        });

        if (!user) {
            return res.status(401).json({
                error: 'Kullanıcı adı veya şifre hatalı'
            });
        }

        // Aktif kontrolü
        if (!user.aktif) {
            return res.status(401).json({
                error: 'Hesabınız aktif değil'
            });
        }

        // Şifre kontrolü
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                error: 'Kullanıcı adı veya şifre hatalı'
            });
        }

        // Token oluştur
        const token = jwt.sign(
            {
                id: user.id,
                personelId: user.personelId,
                email: user.email,
                rol: user.rol
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Stok uyarılarını kontrol et (basitleştirilmiş)
        let stockAlerts = { critical: 0, low: 0, total: 0 };
        try {
            const materials = await prisma.material.findMany({
                where: {
                    aktif: true,
                    OR: [
                        { mevcutStok: { lte: 0 } },
                        {
                            AND: [
                                { kritikSeviye: { not: null } },
                                { mevcutStok: { lte: 10 } }
                            ]
                        }
                    ]
                }
            });

            stockAlerts = {
                total: materials.length,
                critical: materials.filter(m => m.mevcutStok <= 0).length,
                low: materials.filter(m => m.mevcutStok > 0 && m.mevcutStok <= 10).length
            };
        } catch (error) {
            console.error('Stok kontrolü hatası:', error);
        }

        // Response
        return res.status(200).json({
            success: true,
            token,
            user: {
                id: user.id,
                personelId: user.personelId,
                ad: user.ad,
                soyad: user.soyad,
                email: user.email,
                rol: user.rol
            },
            stockAlerts
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            error: 'Sunucu hatası'
        });
    }
}

export default publicEndpoint(loginHandler);