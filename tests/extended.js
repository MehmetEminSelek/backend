// Extended Backend Test Suite - run with: node tests/extended.js
// Uses Node 18+ global fetch

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function logStep(name, ok, extra = '') {
    const status = ok ? 'OK' : 'FAIL';
    console.log(`- ${name}: ${status}${extra ? ' - ' + extra : ''}`);
}

async function httpJson(method, path, { headers = {}, body = undefined } = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    return { res, json, text };
}

async function run() {
    const results = [];
    let token = null;
    let roleLevel = 0;
    let currentUserId = null;

    // Login
    try {
        const { res, json } = await httpJson('POST', '/api/auth/login', {
            body: { kullaniciAdi: 'baris.gullu', sifre: 'bar123' },
        });
        const ok = res.status === 200 && json?.accessToken;
        if (ok) token = json.accessToken;
        results.push(ok);
        logStep('Login', ok, `status=${res.status}`);
    } catch (e) {
        results.push(false);
        logStep('Login', false, e.message);
    }

    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    // Validate
    try {
        const { res, json } = await httpJson('GET', '/api/auth/validate', { headers: authHeaders });
        const ok = res.status === 200 && json?.roleLevel >= 0 && json?.user?.id;
        if (ok) { roleLevel = json.roleLevel; currentUserId = json.user.id; }
        results.push(ok);
        logStep('Validate', ok, `roleLevel=${json?.roleLevel ?? 'n/a'}, userId=${json?.user?.id ?? 'n/a'}`);
    } catch (e) {
        results.push(false);
        logStep('Validate', false, e.message);
    }

    // Materials GET
    try {
        const { res, json } = await httpJson('GET', '/api/materials?limit=5', { headers: authHeaders });
        const ok = res.status === 200 && json?.success === true;
        results.push(ok);
        logStep('Materials list', ok, `status=${res.status}`);
    } catch (e) {
        results.push(false);
        logStep('Materials list', false, e.message);
    }

    // Products: create -> update -> delete
    let createdProductId = null;
    try {
        const unique = `TST-${Date.now()}`;
        const { res, json, text } = await httpJson('POST', '/api/urunler', {
            headers: authHeaders,
            body: { ad: `Test Ürün ${unique}`, kod: `KOD-${unique}`, satisaUygun: true }
        });
        const ok = res.status === 201 && json?.product?.id;
        if (ok) createdProductId = json.product.id;
        results.push(ok);
        logStep('Product create', ok, `status=${res.status}, id=${createdProductId ?? 'n/a'}`);
        if (!ok) console.log('Product create body:', text);
    } catch (e) {
        results.push(false);
        logStep('Product create', false, e.message);
    }

    try {
        if (!createdProductId) throw new Error('no product');
        const { res, json } = await httpJson('PUT', '/api/urunler', {
            headers: authHeaders,
            body: { id: createdProductId, aciklama: 'Güncellendi' }
        });
        const ok = res.status === 200 && json?.product?.id === createdProductId;
        results.push(ok);
        logStep('Product update', ok, `status=${res.status}`);
    } catch (e) {
        results.push(false);
        logStep('Product update', false, e.message);
    }

    try {
        if (!createdProductId) throw new Error('no product');
        const { res } = await httpJson('DELETE', '/api/urunler', {
            headers: authHeaders,
            body: { id: createdProductId }
        });
        const ok = res.status === 200;
        results.push(ok);
        logStep('Product delete', ok, `status=${res.status}`);
    } catch (e) {
        results.push(false);
        logStep('Product delete', false, e.message);
    }

    // Cari: create -> update -> delete
    let createdCariId = null;
    try {
        const unique = `TST-${Date.now()}`;
        const { res, json, text } = await httpJson('POST', '/api/cari', {
            headers: authHeaders,
            body: { cariAdi: `Test Cari ${unique}`, musteriKodu: `CAR-${unique}` }
        });
        const ok = res.status === 201 && json?.customer?.id;
        if (ok) createdCariId = json.customer.id;
        results.push(ok);
        logStep('Cari create', ok, `status=${res.status}, id=${createdCariId ?? 'n/a'}`);
        if (!ok) console.log('Cari create body:', text);
    } catch (e) {
        results.push(false);
        logStep('Cari create', false, e.message);
    }

    try {
        if (!createdCariId) throw new Error('no cari');
        const { res, json } = await httpJson('PUT', '/api/cari', {
            headers: authHeaders,
            body: { id: createdCariId, irtibatAdi: 'Güncellendi' }
        });
        const ok = res.status === 200 && json?.customer?.id === createdCariId;
        results.push(ok);
        logStep('Cari update', ok, `status=${res.status}`);
    } catch (e) {
        results.push(false);
        logStep('Cari update', false, e.message);
    }

    try {
        if (!createdCariId) throw new Error('no cari');
        const { res } = await httpJson('DELETE', '/api/cari', {
            headers: authHeaders,
            body: { id: createdCariId }
        });
        const ok = res.status === 200;
        results.push(ok);
        logStep('Cari delete', ok, `status=${res.status}`);
    } catch (e) {
        results.push(false);
        logStep('Cari delete', false, e.message);
    }

    // Recete maliyet: updateStored true
    try {
        // fetch one recipe id
        const { json: listJson } = await httpJson('GET', '/api/receteler?limit=1', { headers: authHeaders });
        const rid = listJson?.recipes?.[0]?.id;
        if (!rid) throw new Error('no recipe');
        const { res, json, text } = await httpJson('POST', '/api/receteler/maliyet', {
            headers: authHeaders,
            body: { recipeId: rid, portion: 1, updateStored: true }
        });
        const expectUpdate = roleLevel >= 70;
        const ok = res.status === 200 && (!expectUpdate || (json?.data?.updatedRecipe && json?.data?.updatedRecipe?.updated === true));
        results.push(ok);
        logStep('Reçete maliyet (updateStored)', ok, `status=${res.status}`);
        if (!ok) console.log('Maliyet body:', text);
    } catch (e) {
        results.push(false);
        logStep('Reçete maliyet (updateStored)', false, e.message);
    }

    // Users admin flow: ensure we can PUT/DELETE with elevated role
    // If current role is < 90, try to create an admin user (GENEL_MUDUR) and then update/delete it
    let tempAdminId = null;
    try {
        if (roleLevel < 90) {
            const uniq = `adm${Date.now()}`;
            const { res, json, text } = await httpJson('POST', '/api/auth/users', {
                headers: authHeaders,
                body: {
                    ad: 'Test', soyad: 'Admin', email: `${uniq}@example.com`, username: uniq,
                    password: 'Admin12345', rol: 'PERSONEL'
                }
            });
            // Viewer ile admin yaratamayız; beklenen 403/400. Burada sadece sonucu raporlayıp devam edelim.
            const ok = res.status === 201 || res.status === 403 || res.status === 400;
            if (res.status === 201) tempAdminId = json?.user?.id;
            results.push(ok);
            logStep('Users create (as low role)', ok, `status=${res.status}`);
            if (!ok) console.log('Users create (low) body:', text);
        } else {
            // We have high role; create a user then update/delete it
            const uniq = `mgr${Date.now()}`;
            const { res, json, text } = await httpJson('POST', '/api/auth/users', {
                headers: authHeaders,
                body: {
                    ad: 'Test', soyad: 'Manager', email: `${uniq}@example.com`, username: uniq,
                    password: 'Manager12345', rol: 'SUBE_PERSONELI'
                }
            });
            const ok = res.status === 201 && json?.user?.id;
            if (ok) tempAdminId = json.user.id;
            results.push(ok);
            logStep('Users create (as high role)', ok, `status=${res.status}, id=${tempAdminId ?? 'n/a'}`);
            if (!ok) console.log('Users create (high) body:', text);
        }
    } catch (e) {
        results.push(false);
        logStep('Users create (role setup)', false, e.message);
    }

    // Users PUT on created user (if any or fallback to id=9 when high role)
    try {
        const targetId = tempAdminId || (roleLevel >= 80 ? 9 : null);
        if (!targetId) throw new Error('no target user');
        const { res, json, text } = await httpJson('PUT', '/api/auth/users', {
            headers: authHeaders,
            body: { userId: targetId, telefon: '5551234567' }
        });
        const expectedOk = roleLevel >= 80;
        const ok = (expectedOk && res.status === 200 && json?.user?.id === targetId) || (!expectedOk && res.status === 403);
        results.push(ok);
        logStep('Users PUT (RBAC)', ok, `status=${res.status}`);
        if (!ok) console.log('Users PUT body:', text);
    } catch (e) {
        results.push(false);
        logStep('Users PUT (RBAC)', false, e.message);
    }

    // Users DELETE on created user (not self)
    try {
        const targetId = tempAdminId && tempAdminId !== currentUserId ? tempAdminId : null;
        if (!targetId) throw new Error('no deletable user');
        const { res, text } = await httpJson('DELETE', '/api/auth/users', {
            headers: authHeaders,
            body: { userId: targetId }
        });
        const expectedDelete = roleLevel >= 90;
        const ok = (expectedDelete && res.status === 200) || (!expectedDelete && (res.status === 403 || res.status === 400));
        results.push(ok);
        logStep('Users DELETE (RBAC)', ok, `status=${res.status}`);
        if (!ok) console.log('Users DELETE body:', text);
    } catch (e) {
        results.push(false);
        logStep('Users DELETE (RBAC)', false, e.message);
    }

    // Users [id] invalid method
    try {
        const { res } = await httpJson('POST', '/api/auth/users/9', { headers: authHeaders, body: {} });
        const ok = res.status === 405;
        results.push(ok);
        logStep('Users [id] POST (405 expected)', ok, `status=${res.status}`);
    } catch (e) {
        results.push(false);
        logStep('Users [id] POST (405 expected)', false, e.message);
    }

    const passed = results.every(Boolean);
    console.log(`\nExtended summary: ${results.filter(Boolean).length}/${results.length} passed`);
    process.exit(passed ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); }); 