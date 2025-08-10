#!/usr/bin/env node
/*
  Purge soft-deleted records older than 30 days.
  Usage: node scripts/cleanup-soft-deleted.cjs [--days N]
*/
import prisma from '../lib/prisma.js';

async function main() {
    const args = process.argv.slice(2);
    const daysArgIdx = args.indexOf('--days');
    const days = daysArgIdx >= 0 ? parseInt(args[daysArgIdx + 1]) : 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    console.log(`🧹 Cleaning soft-deleted records older than ${days} days (before ${cutoff.toISOString()})`);

    // Urun
    const delUrun = await prisma.urun.deleteMany({ where: { deletedAt: { lt: cutoff } } });
    // Recipe
    const delRecipe = await prisma.recipe.deleteMany({ where: { deletedAt: { lt: cutoff } } });
    // UrunFiyat
    const delFiyat = await prisma.urunFiyat.deleteMany({ where: { deletedAt: { lt: cutoff } } });

    console.log(`✅ Deleted: urun=${delUrun.count}, recipe=${delRecipe.count}, urunFiyat=${delFiyat.count}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });


