import prisma from '../../../../lib/prisma.js'
import { secureAPI } from '../../../../lib/api-security.js'
import { withPrismaSecurity } from '../../../../lib/prisma-security.js'
import { PERMISSIONS } from '../../../../lib/rbac-enhanced.js'
import { auditLog } from '../../../../lib/audit-logger.js'

const VALID_TR_ROLES = [
    'GENEL_MUDUR',
    'SUBE_MUDURU',
    'URETIM_MUDURU',
    'SEVKIYAT_MUDURU',
    'CEP_DEPO_MUDURU',
    'SUBE_PERSONELI',
    'URETIM_PERSONEL',
    'SEVKIYAT_PERSONELI',
    'SOFOR',
    'PERSONEL'
]

async function handler(req, res) {
    const idParam = req.query.id
    const userId = parseInt(idParam)

    if (!userId || Number.isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user id' })
    }

    try {
        switch (req.method) {
            case 'GET':
                return await getUser(req, res, userId)
            case 'PUT':
                return await updateUser(req, res, userId)
            case 'DELETE':
                return await deleteUser(req, res, userId)
            default:
                res.setHeader('Allow', ['GET', 'PUT', 'DELETE'])
                return res.status(405).json({ error: 'Method not allowed' })
        }
    } catch (error) {
        console.error('Users [id] API Error:', error)
        return res.status(500).json({ error: 'Users operation failed', code: 'USERS_ID_ERROR' })
    }
}

async function getUser(req, res, userId) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
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
            sube: { select: { id: true, ad: true, kod: true } },
            createdAt: true,
            updatedAt: true
        }
    })

    if (!user) {
        return res.status(404).json({ error: 'User not found' })
    }

    return res.status(200).json({ success: true, user })
}

async function updateUser(req, res, userId) {
    // Permission check: update users
    if (req.user.roleLevel < 80) {
        return res.status(403).json({ error: 'Insufficient permissions to update users' })
    }

    const allowedFields = ['ad', 'soyad', 'email', 'telefon', 'rol', 'aktif', 'subeId']
    const updateData = {}
    for (const key of allowedFields) {
        if (req.body[key] !== undefined) updateData[key] = req.body[key]
    }

    if (updateData.rol && !VALID_TR_ROLES.includes(updateData.rol)) {
        return res.status(400).json({ error: 'Invalid role specified' })
    }

    // Self role change guard for non-super admins
    if (updateData.rol && req.user.roleLevel < 90 && req.user.userId === userId) {
        return res.status(403).json({ error: 'You cannot change your own role' })
    }

    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!exists) {
        return res.status(404).json({ error: 'User not found' })
    }

    const updated = await prisma.user.update({
        where: { id: userId },
        data: { ...updateData, updatedAt: new Date() },
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
            updatedAt: true
        }
    })

    try {
        await auditLog({
            personelId: req.user.personelId || 'SYSTEM',
            action: 'USER_UPDATED',
            tableName: 'USER',
            recordId: userId,
            oldValues: null,
            newValues: updateData,
            description: 'User updated (path-based) ',
            req
        })
    } catch { }

    return res.status(200).json({ success: true, user: updated })
}

async function deleteUser(req, res, userId) {
    // Permission check: delete users
    if (req.user.roleLevel < 90) {
        return res.status(403).json({ error: 'Insufficient permissions to delete users' })
    }

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, rol: true } })
    if (!target) {
        return res.status(404).json({ error: 'User not found' })
    }
    if (req.user.userId === userId) {
        return res.status(400).json({ error: 'Cannot delete your own account' })
    }

    await prisma.user.update({ where: { id: userId }, data: { aktif: false, updatedAt: new Date() } })

    try {
        await auditLog({
            personelId: req.user.personelId || 'SYSTEM',
            action: 'USER_DELETED',
            tableName: 'USER',
            recordId: userId,
            oldValues: null,
            newValues: { aktif: false },
            description: 'User soft-deleted (path-based)',
            req
        })
    } catch { }

    return res.status(200).json({ success: true, message: 'User deleted successfully' })
}

export default secureAPI(
    withPrismaSecurity(handler),
    {
        permission: PERMISSIONS.VIEW_USERS,
        preventSQLInjection: true,
        enableAuditLogging: true
    }
) 