import { secureAPI } from '../../../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../../../lib/audit-logger.js';
import prisma from '../../../../../lib/prisma.js';

async function paymentDeleteHandler(req, res) {
    const { method } = req;
    const { id: siparisId, paymentId } = req.query;

    if (method !== 'DELETE') {
        res.setHeader('Allow', ['DELETE']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const orderId = parseInt(String(siparisId));
    const odemeId = parseInt(String(paymentId));

    if (!Number.isInteger(orderId) || !Number.isInteger(odemeId)) {
        return res.status(400).json({ error: 'Geçerli sipariş ve ödeme ID gereklidir' });
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const payment = await tx.cariOdeme.findFirst({
                where: { id: odemeId, siparisId: orderId },
                select: { id: true, tutar: true, siparisId: true }
            });

            if (!payment) {
                return { notFound: true };
            }

            // Delete related financial movement if exists (linked by odemeId)
            await tx.cariHareket.deleteMany({ where: { odemeId: payment.id } });

            // Delete the payment
            await tx.cariOdeme.delete({ where: { id: payment.id } });

            // Recalculate totals and update order payment status if needed
            const [siparis, remainingPayments] = await Promise.all([
                tx.siparis.findUnique({ where: { id: orderId }, select: { id: true, toplamTutar: true } }),
                tx.cariOdeme.findMany({ where: { siparisId: orderId }, select: { tutar: true } })
            ]);

            let totalPaid = 0;
            for (const p of remainingPayments) totalPaid += Number(p.tutar || 0);

            const orderTotal = Number(siparis?.toplamTutar || 0);
            let odemeDurumu = null;
            if (totalPaid >= orderTotal && orderTotal > 0) odemeDurumu = 'tamamlandi';
            else if (totalPaid > 0) odemeDurumu = 'kısmi';

            await tx.siparis.update({ where: { id: orderId }, data: { odemeDurumu } });

            return { success: true, totalPaid, orderTotal };
        });

        if (result?.notFound) {
            return res.status(404).json({ error: 'Ödeme bulunamadı' });
        }

        auditLog('PAYMENT_DELETED', 'Payment record deleted', {
            userId: req.user?.userId,
            siparisId: orderId,
            paymentId: odemeId
        });

        return res.status(200).json({ success: true, totalPaid: result.totalPaid, orderTotal: result.orderTotal });
    } catch (error) {
        console.error('DELETE payment error:', error);
        return res.status(500).json({ error: 'Ödeme silinirken hata oluştu' });
    }
}

export default secureAPI(
    withPrismaSecurity(paymentDeleteHandler),
    {
        permission: PERMISSIONS.MANAGE_PAYMENTS,
        preventSQLInjection: true,
        enableAuditLogging: true
    }
);


