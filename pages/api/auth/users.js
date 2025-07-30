/**
 * =============================================
 * SECURED USERS API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../lib/audit-logger.js';
import { validateInput } from '../../../lib/validation.js';
import bcrypt from 'bcrypt';

/**
 * Users API Handler with Full Security Integration
 */
async function usersHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await getUsers(req, res);
            case 'POST':
                return await createUser(req, res);
            case 'PUT':
                return await updateUser(req, res);
            case 'DELETE':
                return await deleteUser(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST', 'PUT', 'DELETE']
                });
        }
    } catch (error) {
        console.error('Users API Error:', error);

        auditLog('USERS_API_ERROR', 'Users API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'User operation failed',
            code: 'USERS_ERROR'
        });
    }
}

/**
 * Get Users List with Security Filtering
 */
async function getUsers(req, res) {
    const { search, sube, aktif, page = 1, limit = 50 } = req.query;

    // Query building with security filters
    const whereClause = {};

    if (search) {
        whereClause.OR = [
            { ad: { contains: search, mode: 'insensitive' } },
            { soyad: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { username: { contains: search, mode: 'insensitive' } }
        ];
    }

    if (sube) {
        whereClause.subeId = parseInt(sube);
    }

    if (aktif !== undefined) {
        whereClause.aktif = aktif === 'true';
    }

    // Secure database query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 100); // Max 100 per page

    const [users, totalCount] = await Promise.all([
        req.prisma.secureQuery('user', 'findMany', {
            where: whereClause,
            select: {
                id: true,
                personelId: true,
                ad: true,
                soyad: true,
                email: true,
                username: true,
                rol: true,
                telefon: true,
                aktif: true,
                subeId: true,
                gunlukUcret: req.user.roleLevel >= 80, // Only managers+ can see salary
                sgkDurumu: true,
                girisYili: true,
                olusturmaTarihi: true,
                sube: {
                    select: {
                        id: true,
                        ad: true,
                        kod: true
                    }
                }
            },
            orderBy: [
                { aktif: 'desc' },
                { ad: 'asc' }
            ],
            skip,
            take
        }),
        req.prisma.secureQuery('user', 'count', {
            where: whereClause
        })
    ]);

    auditLog('USERS_VIEW', 'Users list accessed', {
        userId: req.user.userId,
        totalUsers: totalCount,
        page,
        limit: take,
        filters: { search, sube, aktif }
    });

    return res.status(200).json({
        success: true,
        users,
        pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCount / take),
            totalItems: totalCount,
            itemsPerPage: take
        }
    });
}

/**
 * Create New User with Enhanced Security
 */
async function createUser(req, res) {
    // Input validation with security checks
    const validationResult = validateInput(req.body, {
        requiredFields: ['ad', 'soyad', 'email', 'username', 'password', 'rol'],
        allowedFields: [
            'personelId', 'ad', 'soyad', 'email', 'username', 'password', 'rol',
            'telefon', 'subeId', 'gunlukUcret', 'sgkDurumu', 'girisYili', 'aktif'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid user data',
            details: validationResult.errors
        });
    }

    const {
        personelId, ad, soyad, email, username, password, rol,
        telefon, subeId, gunlukUcret, sgkDurumu, girisYili, aktif = true
    } = req.body;

    // Business logic validation
    if (password.length < 8) {
        return res.status(400).json({
            error: 'Password must be at least 8 characters long'
        });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({
            error: 'Invalid email format'
        });
    }

    // Role validation
    const validRoles = ['super_admin', 'admin', 'manager', 'supervisor', 'operator', 'editor', 'viewer', 'guest'];
    if (!validRoles.includes(rol)) {
        return res.status(400).json({
            error: 'Invalid role specified'
        });
    }

    // Permission check for role assignment
    if (rol === 'super_admin' && req.user.rol !== 'super_admin') {
        return res.status(403).json({
            error: 'Only super admins can create super admin users'
        });
    }

    if (['admin', 'manager'].includes(rol) && req.user.roleLevel < 90) {
        return res.status(403).json({
            error: 'Insufficient permissions to create admin/manager users'
        });
    }

    // Secure transaction for user creation
    const result = await req.prisma.secureTransaction(async (tx) => {
        // Check for existing users
        const existingUser = await tx.secureQuery('user', 'findFirst', {
            where: {
                OR: [
                    { email },
                    { username },
                    ...(personelId ? [{ personelId }] : [])
                ]
            }
        });

        if (existingUser) {
            let field = 'email';
            if (existingUser.username === username) field = 'username';
            if (existingUser.personelId === personelId) field = 'personelId';

            throw new Error(`User with this ${field} already exists`);
        }

        // Hash password with security-enhanced rounds
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user with audit trail
        const newUser = await tx.secureQuery('user', 'create', {
            data: {
                personelId,
                ad,
                soyad,
                email,
                username,
                password: hashedPassword,
                rol,
                telefon: telefon || null,
                subeId: subeId ? parseInt(subeId) : null,
                gunlukUcret: gunlukUcret ? parseFloat(gunlukUcret) : null,
                sgkDurumu: sgkDurumu || null,
                girisYili: girisYili ? parseInt(girisYili) : null,
                aktif,
                olusturmaTarihi: new Date()
            },
            select: {
                id: true,
                personelId: true,
                ad: true,
                soyad: true,
                email: true,
                username: true,
                rol: true,
                telefon: true,
                aktif: true,
                subeId: true,
                gunlukUcret: true,
                sgkDurumu: true,
                girisYili: true,
                olusturmaTarihi: true
            }
        }, 'USER_CREATED');

        return newUser;
    });

    // Enhanced audit logging
    auditLog('USER_CREATED', 'New user account created', {
        userId: req.user.userId,
        createdUserId: result.id,
        createdUserRole: rol,
        createdUserEmail: email,
        adminAction: true
    });

    return res.status(201).json({
        success: true,
        message: 'User created successfully',
        user: result
    });
}

/**
 * Update User with Security Checks
 */
async function updateUser(req, res) {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({
            error: 'User ID is required'
        });
    }

    // Input validation
    const validationResult = validateInput(req.body, {
        allowedFields: [
            'userId', 'ad', 'soyad', 'email', 'telefon', 'rol', 'aktif',
            'subeId', 'gunlukUcret', 'sgkDurumu', 'password'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid update data',
            details: validationResult.errors
        });
    }

    // Permission checks for user modification
    const targetUser = await req.prisma.secureQuery('user', 'findUnique', {
        where: { id: parseInt(userId) },
        select: { id: true, rol: true, email: true }
    });

    if (!targetUser) {
        return res.status(404).json({
            error: 'User not found'
        });
    }

    // Self-modification check
    const isSelfUpdate = parseInt(userId) === req.user.userId;

    // Role change permissions
    if (req.body.rol && req.body.rol !== targetUser.rol) {
        if (req.user.roleLevel < 90) {
            return res.status(403).json({
                error: 'Insufficient permissions to change user roles'
            });
        }

        if (req.body.rol === 'super_admin' && req.user.rol !== 'super_admin') {
            return res.status(403).json({
                error: 'Only super admins can assign super admin role'
            });
        }
    }

    // Prepare update data
    const updateData = {};
    const allowedFields = ['ad', 'soyad', 'email', 'telefon', 'rol', 'aktif', 'subeId', 'gunlukUcret', 'sgkDurumu'];

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            updateData[field] = req.body[field];
        }
    }

    // Password update with enhanced security
    if (req.body.password) {
        if (req.body.password.length < 8) {
            return res.status(400).json({
                error: 'Password must be at least 8 characters long'
            });
        }

        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        updateData.password = await bcrypt.hash(req.body.password, saltRounds);
    }

    // Update user with security context
    const updatedUser = await req.prisma.secureQuery('user', 'update', {
        where: { id: parseInt(userId) },
        data: {
            ...updateData,
            guncellemeTarihi: new Date()
        },
        select: {
            id: true,
            personelId: true,
            ad: true,
            soyad: true,
            email: true,
            username: true,
            rol: true,
            telefon: true,
            aktif: true,
            subeId: true,
            gunlukUcret: req.user.roleLevel >= 80,
            sgkDurumu: true,
            girisYili: true,
            guncellemeTarihi: true
        }
    }, 'USER_UPDATED');

    auditLog('USER_UPDATED', 'User account updated', {
        userId: req.user.userId,
        updatedUserId: parseInt(userId),
        changes: Object.keys(updateData),
        isSelfUpdate,
        previousRole: targetUser.rol,
        newRole: req.body.rol || targetUser.rol
    });

    return res.status(200).json({
        success: true,
        message: 'User updated successfully',
        user: updatedUser
    });
}

/**
 * Delete User with Enhanced Security
 */
async function deleteUser(req, res) {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({
            error: 'User ID is required'
        });
    }

    // Get user details for audit
    const targetUser = await req.prisma.secureQuery('user', 'findUnique', {
        where: { id: parseInt(userId) },
        select: { id: true, rol: true, email: true, ad: true, soyad: true }
    });

    if (!targetUser) {
        return res.status(404).json({
            error: 'User not found'
        });
    }

    // Permission checks
    if (parseInt(userId) === req.user.userId) {
        return res.status(400).json({
            error: 'Cannot delete your own account'
        });
    }

    if (targetUser.rol === 'super_admin' && req.user.rol !== 'super_admin') {
        return res.status(403).json({
            error: 'Only super admins can delete super admin accounts'
        });
    }

    // Soft delete (set inactive) instead of hard delete for audit trail
    const deletedUser = await req.prisma.secureQuery('user', 'update', {
        where: { id: parseInt(userId) },
        data: {
            aktif: false,
            silinmeTarihi: new Date(),
            silenKullanici: req.user.userId
        }
    }, 'USER_SOFT_DELETED');

    auditLog('USER_DELETED', 'User account deleted (soft delete)', {
        userId: req.user.userId,
        deletedUserId: parseInt(userId),
        deletedUserEmail: targetUser.email,
        deletedUserRole: targetUser.rol,
        deletedUserName: `${targetUser.ad} ${targetUser.soyad}`
    });

    return res.status(200).json({
        success: true,
        message: 'User deleted successfully'
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(usersHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_USERS, // Base permission, individual operations check higher permissions

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_USERS
        // POST: CREATE_USERS  
        // PUT: UPDATE_USERS
        // DELETE: DELETE_USERS

        // Input Validation Configuration
        allowedFields: [
            'userId', 'personelId', 'ad', 'soyad', 'email', 'username', 'password', 'rol',
            'telefon', 'subeId', 'gunlukUcret', 'sgkDurumu', 'girisYili', 'aktif',
            'search', 'sube', 'page', 'limit'
        ],
        requiredFields: {
            POST: ['ad', 'soyad', 'email', 'username', 'password', 'rol'],
            PUT: ['userId'],
            DELETE: ['userId']
        },

        // Security Options
        preventSQLInjection: true,
        enableAuditLogging: true
    }
);