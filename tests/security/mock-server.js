/**
 * =============================================
 * MOCK SERVER FOR SECURITY TESTING
 * =============================================
 * 
 * Simulates Ömer Güllü Sipariş Sistemi API endpoints
 * Includes realistic security implementations for testing
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security headers middleware
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Rate-Limit-Remaining', '99');
    next();
});

// Mock database
const mockDB = {
    users: [
        {
            id: 1,
            kullaniciAdi: 'test_admin',
            sifre: '$2b$12$encrypted_password_hash',
            adiSoyadi: 'Test Admin',
            rol: 'ADMIN',
            roleLevel: 90,
            aktif: true,
            subeId: 1,
            email: 'admin@test.com',
            telefon: '05321234567'
        },
        {
            id: 2,
            kullaniciAdi: 'test_manager',
            sifre: '$2b$12$encrypted_password_hash',
            adiSoyadi: 'Test Manager',
            rol: 'MANAGER',
            roleLevel: 70,
            aktif: true,
            subeId: 1,
            email: 'manager@test.com',
            telefon: '05321234568'
        },
        {
            id: 3,
            kullaniciAdi: 'test_operator',
            sifre: '$2b$12$encrypted_password_hash',
            adiSoyadi: 'Test Operator',
            rol: 'OPERATOR',
            roleLevel: 40,
            aktif: true,
            subeId: 1,
            email: 'operator@test.com',
            telefon: '05321234569'
        }
    ],
    customers: [
        {
            id: 1,
            musteriKodu: 'MUS001',
            ad: 'Ahmet',
            soyad: 'Yılmaz',
            telefon: '05321234567',
            email: 'ahmet@example.com',
            subeId: 1
        }
    ],
    orders: [
        {
            id: 1,
            siparisNo: 'SIP-2024-001',
            musteriId: 1,
            durum: 'BEKLIYOR',
            toplamTutar: 450.00,
            maliyet: 315.00,
            subeId: 1
        }
    ],
    products: [
        {
            id: 1,
            urunAdi: 'Antep Baklavası',
            satisFiyati: 25.50,
            maliyet: 18.75,
            kdvDahilFiyat: 30.09
        }
    ]
};

// Authentication helpers
const JWT_SECRET = 'test_secret_key_for_demo';
const failedLogins = new Map();

function validatePassword(inputPassword, userPassword) {
    // Simple validation for demo (in real app, use bcrypt)
    return inputPassword === 'TestPass123!' || inputPassword === 'test123';
}

function generateToken(user) {
    return jwt.sign(
        {
            sub: user.id.toString(),
            username: user.kullaniciAdi,
            role: user.rol,
            roleLevel: user.roleLevel,
            subeId: user.subeId
        },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
}

function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: { code: 'AUTH_001', message: 'Authentication required' }
        });
    }

    const token = authHeader.slice(7);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: { code: 'AUTH_002', message: 'Invalid or expired token' }
        });
    }
}

function checkPermission(requiredLevel) {
    return (req, res, next) => {
        if (!req.user || req.user.roleLevel < requiredLevel) {
            return res.status(403).json({
                success: false,
                error: { code: 'AUTHZ_001', message: 'Insufficient permissions' }
            });
        }
        next();
    };
}

function validateCSRF(req, res, next) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const csrfToken = req.headers['x-csrf-token'];
        if (!csrfToken) {
            return res.status(403).json({
                success: false,
                error: { code: 'CSRF_001', message: 'CSRF token required' }
            });
        }
        // Simple CSRF validation for demo
        if (csrfToken !== 'test_csrf_token' && csrfToken.length < 10) {
            return res.status(403).json({
                success: false,
                error: { code: 'CSRF_002', message: 'Invalid CSRF token' }
            });
        }
    }
    next();
}

function sanitizeInput(input) {
    if (typeof input === 'string') {
        return input
            .replace(/<script>/gi, '')
            .replace(/<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '');
    }
    return input;
}

function rateLimitCheck(req, res, next) {
    const ip = req.ip || '127.0.0.1';
    const key = `${ip}:${req.path}`;

    // Simple rate limiting for demo
    if (req.path === '/api/auth/login') {
        const attempts = failedLogins.get(ip) || 0;
        if (attempts >= 5) {
            return res.status(429).json({
                success: false,
                error: { code: 'RATE_001', message: 'Rate limit exceeded' }
            });
        }
    }

    next();
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            server: 'OG Mock Server v1.0'
        }
    });
});

// Authentication
app.post('/api/auth/login', rateLimitCheck, (req, res) => {
    const { kullaniciAdi, sifre } = req.body;
    const ip = req.ip || '127.0.0.1';

    // Input validation
    if (!kullaniciAdi || !sifre) {
        return res.status(422).json({
            success: false,
            error: { code: 'VAL_001', message: 'Username and password required' }
        });
    }

    // Sanitize inputs
    const cleanUsername = sanitizeInput(kullaniciAdi);
    const cleanPassword = sanitizeInput(sifre);

    // Find user
    const user = mockDB.users.find(u => u.kullaniciAdi === cleanUsername);

    if (!user || !validatePassword(cleanPassword, user.sifre)) {
        // Track failed attempts
        const attempts = failedLogins.get(ip) || 0;
        failedLogins.set(ip, attempts + 1);

        return res.status(401).json({
            success: false,
            error: { code: 'AUTH_003', message: 'Invalid credentials' }
        });
    }

    if (!user.aktif) {
        return res.status(401).json({
            success: false,
            error: { code: 'AUTH_004', message: 'Account deactivated' }
        });
    }

    // Success - clear failed attempts
    failedLogins.delete(ip);

    const token = generateToken(user);

    res.json({
        success: true,
        data: {
            token,
            refreshToken: 'mock_refresh_token',
            csrfToken: 'test_csrf_token',
            user: {
                id: user.id,
                adiSoyadi: user.adiSoyadi,
                rol: user.rol,
                roleLevel: user.roleLevel,
                subeId: user.subeId
            },
            sessionExpiry: new Date(Date.now() + 3600000).toISOString()
        }
    });
});

// CSRF token endpoint
app.get('/api/auth/csrf', verifyToken, (req, res) => {
    res.json({
        success: true,
        data: {
            csrfToken: 'test_csrf_token',
            expiry: new Date(Date.now() + 3600000).toISOString()
        }
    });
});

// User management
app.get('/api/auth/users', verifyToken, checkPermission(70), (req, res) => {
    const { search, page = 1, limit = 10 } = req.query;

    let users = mockDB.users.map(user => {
        const userData = {
            id: user.id,
            adiSoyadi: user.adiSoyadi,
            rol: user.rol,
            aktif: user.aktif,
            subeId: user.subeId
        };

        // Role-based data filtering
        if (req.user.roleLevel >= 70) {
            userData.email = user.email;
            userData.telefon = user.telefon;
        } else {
            userData.email = user.email.replace(/(.{2}).*@/, '$1***@');
            userData.telefon = user.telefon.slice(-4).padStart(11, '*');
        }

        return userData;
    });

    // Search filtering
    if (search) {
        const cleanSearch = sanitizeInput(search);
        users = users.filter(user =>
            user.adiSoyadi.toLowerCase().includes(cleanSearch.toLowerCase())
        );
    }

    res.json({
        success: true,
        data: {
            users,
            pagination: {
                total: users.length,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(users.length / limit)
            }
        }
    });
});

app.post('/api/auth/users', verifyToken, checkPermission(70), validateCSRF, (req, res) => {
    const { adiSoyadi, email, telefon, rol } = req.body;

    // Input validation
    if (!adiSoyadi || !email || !telefon || !rol) {
        return res.status(422).json({
            success: false,
            error: { code: 'VAL_001', message: 'Required fields missing' }
        });
    }

    // Email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(422).json({
            success: false,
            error: { code: 'VAL_002', message: 'Invalid email format' }
        });
    }

    // Phone validation
    if (!/^05\d{9}$/.test(telefon)) {
        return res.status(422).json({
            success: false,
            error: { code: 'VAL_003', message: 'Invalid phone format' }
        });
    }

    // Sanitize inputs
    const newUser = {
        id: mockDB.users.length + 1,
        kullaniciAdi: `user_${Date.now()}`,
        adiSoyadi: sanitizeInput(adiSoyadi),
        email: sanitizeInput(email),
        telefon: sanitizeInput(telefon),
        rol: sanitizeInput(rol),
        roleLevel: rol === 'ADMIN' ? 90 : rol === 'MANAGER' ? 70 : 40,
        aktif: true,
        subeId: req.user.subeId
    };

    mockDB.users.push(newUser);

    res.json({
        success: true,
        data: {
            id: newUser.id,
            adiSoyadi: newUser.adiSoyadi,
            rol: newUser.rol,
            tempPassword: 'TempPass123!',
            mustChangePassword: true
        }
    });
});

// Customer management
app.get('/api/cari', verifyToken, (req, res) => {
    const { search } = req.query;

    let customers = mockDB.customers.filter(customer =>
        customer.subeId === req.user.subeId || req.user.roleLevel >= 80
    );

    // Role-based data filtering
    customers = customers.map(customer => {
        const customerData = {
            id: customer.id,
            musteriKodu: customer.musteriKodu,
            musteriTipi: 'BIREYSEL'
        };

        if (req.user.roleLevel >= 70) {
            customerData.ad = customer.ad;
            customerData.soyad = customer.soyad;
            customerData.telefon = customer.telefon;
            customerData.email = customer.email;
        } else {
            customerData.ad = '***';
            customerData.soyad = '***';
            customerData.telefon = customer.telefon.slice(-4).padStart(11, '*');
            customerData.email = customer.email.replace(/(.{2}).*@/, '$1***@');
        }

        return customerData;
    });

    if (search) {
        const cleanSearch = sanitizeInput(search);
        customers = customers.filter(customer =>
            customer.musteriKodu.includes(cleanSearch) ||
            (customer.ad && customer.ad.toLowerCase().includes(cleanSearch.toLowerCase()))
        );
    }

    res.json({
        success: true,
        data: customers
    });
});

app.post('/api/cari', verifyToken, validateCSRF, (req, res) => {
    const { musteriKodu, ad, soyad, telefon, email } = req.body;

    // Input validation
    if (!musteriKodu || !ad || !soyad || !telefon) {
        return res.status(422).json({
            success: false,
            error: { code: 'VAL_001', message: 'Required fields missing' }
        });
    }

    const newCustomer = {
        id: mockDB.customers.length + 1,
        musteriKodu: sanitizeInput(musteriKodu),
        ad: sanitizeInput(ad),
        soyad: sanitizeInput(soyad),
        telefon: sanitizeInput(telefon),
        email: email ? sanitizeInput(email) : null,
        subeId: req.user.subeId
    };

    mockDB.customers.push(newCustomer);

    res.json({
        success: true,
        data: newCustomer
    });
});

// Orders
app.get('/api/siparis', verifyToken, (req, res) => {
    let orders = mockDB.orders.filter(order =>
        order.subeId === req.user.subeId || req.user.roleLevel >= 80
    );

    // Role-based financial data filtering
    orders = orders.map(order => {
        const orderData = {
            id: order.id,
            siparisNo: order.siparisNo,
            musteriId: order.musteriId,
            durum: order.durum,
            toplamTutar: order.toplamTutar,
            subeId: order.subeId
        };

        if (req.user.roleLevel >= 70) {
            orderData.maliyet = order.maliyet;
            orderData.karMarji = ((order.toplamTutar - order.maliyet) / order.toplamTutar * 100).toFixed(1);
        }

        return orderData;
    });

    res.json({
        success: true,
        data: { orders }
    });
});

app.post('/api/siparis', verifyToken, checkPermission(40), validateCSRF, (req, res) => {
    const { musteriId, items } = req.body;

    if (!musteriId || !items || !Array.isArray(items)) {
        return res.status(422).json({
            success: false,
            error: { code: 'VAL_001', message: 'Invalid order data' }
        });
    }

    // Business logic validation
    let toplamTutar = 0;
    for (const item of items) {
        if (!item.urunId || !item.miktar || !item.birimFiyat) {
            return res.status(422).json({
                success: false,
                error: { code: 'VAL_002', message: 'Invalid item data' }
            });
        }

        // Price manipulation check
        if (item.birimFiyat < 1) {
            return res.status(422).json({
                success: false,
                error: { code: 'BIZ_001', message: 'Suspicious pricing detected' }
            });
        }

        toplamTutar += item.miktar * item.birimFiyat;
    }

    const newOrder = {
        id: mockDB.orders.length + 1,
        siparisNo: `SIP-2024-${String(mockDB.orders.length + 1).padStart(3, '0')}`,
        musteriId,
        durum: 'ONAY_BEKLIYOR',
        toplamTutar,
        maliyet: toplamTutar * 0.7, // 30% margin
        subeId: req.user.subeId
    };

    mockDB.orders.push(newOrder);

    res.json({
        success: true,
        data: {
            id: newOrder.id,
            siparisNo: newOrder.siparisNo,
            durum: newOrder.durum,
            toplamTutar: newOrder.toplamTutar
        }
    });
});

// Products/Prices
app.get('/api/fiyatlar', verifyToken, (req, res) => {
    const products = mockDB.products.map(product => {
        const productData = {
            id: product.id,
            urunAdi: product.urunAdi,
            satisFiyati: product.satisFiyati,
            kdvDahilFiyat: product.kdvDahilFiyat
        };

        // Cost data only for managers+
        if (req.user.roleLevel >= 70) {
            productData.maliyet = product.maliyet;
            productData.karMarji = ((product.satisFiyati - product.maliyet) / product.satisFiyati * 100).toFixed(1);
        }

        return productData;
    });

    res.json({
        success: true,
        data: products
    });
});

// Dropdown data
app.get('/api/dropdown', verifyToken, (req, res) => {
    res.json({
        success: true,
        data: {
            roles: ['VIEWER', 'OPERATOR', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
            statuses: ['BEKLIYOR', 'ONAYLANDI', 'HAZIRLANIYOR', 'HAZIR', 'TESLIM_EDILDI'],
            branches: [
                { id: 1, name: 'Merkez Şube' },
                { id: 2, name: 'İstanbul Şube' }
            ]
        }
    });
});

// File upload endpoint
app.post('/api/excel/upload/kullanici', verifyToken, checkPermission(70), validateCSRF, (req, res) => {
    // Simple file upload simulation
    const contentType = req.headers['content-type'];

    if (!contentType || !contentType.includes('multipart/form-data')) {
        return res.status(422).json({
            success: false,
            error: { code: 'FILE_001', message: 'Multipart form data required' }
        });
    }

    // Simulate file validation
    const isValidFile = Math.random() > 0.2; // 80% success rate

    if (!isValidFile) {
        return res.status(422).json({
            success: false,
            error: { code: 'FILE_002', message: 'Invalid file type or content' }
        });
    }

    res.json({
        success: true,
        data: {
            processedRows: 25,
            createdUsers: 20,
            updatedUsers: 3,
            errors: [
                {
                    row: 15,
                    error: 'Email already exists',
                    data: { email: 'duplicate@example.com' }
                }
            ],
            auditId: 'audit_' + Date.now()
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);

    // Don't leak error details in production
    res.status(500).json({
        success: false,
        error: {
            code: 'SERVER_001',
            message: 'Internal server error'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: 'Endpoint not found'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 OG Mock Server running on http://localhost:${PORT}`);
    console.log(`📋 Available endpoints:`);
    console.log(`   GET  /api/health`);
    console.log(`   POST /api/auth/login`);
    console.log(`   GET  /api/auth/users`);
    console.log(`   POST /api/auth/users`);
    console.log(`   GET  /api/cari`);
    console.log(`   POST /api/cari`);
    console.log(`   GET  /api/siparis`);
    console.log(`   POST /api/siparis`);
    console.log(`   GET  /api/fiyatlar`);
    console.log(`   GET  /api/dropdown`);
    console.log(`\n🔐 Test credentials:`);
    console.log(`   Username: test_admin | Password: TestPass123!`);
    console.log(`   Username: test_manager | Password: TestPass123!`);
    console.log(`   Username: test_operator | Password: TestPass123!`);
    console.log(`\n✨ Ready for security testing!`);
});

module.exports = app; 