// Smoke Test Suite (ESM) - run with: node tests/smoke.js
// Uses Node 18+ global fetch

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
import { saveResponse } from './utils/io.js';

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
    let firstRecipeId = null;

    // 1) Health
    try {
        const { res, json } = await httpJson('GET', '/api/health');
        const ok = res.status === 200 && json?.status === 'healthy';
        saveResponse('health', { status: res.status, json });
        results.push(ok);
        logStep('Health', ok, `status=${res.status}`);
    } catch (e) {
        results.push(false);
        logStep('Health', false, e.message);
    }

    // 2) Login
    try {
        const { res, json } = await httpJson('POST', '/api/auth/login', {
            body: { kullaniciAdi: 'baris.gullu', sifre: 'bar123' },
        });
        const ok = res.status === 200 && json?.accessToken;
        saveResponse('login', { status: res.status, json });
        if (ok) token = json.accessToken;
        results.push(ok);
        logStep('Login', ok, `status=${res.status}`);
    } catch (e) {
        results.push(false);
        logStep('Login', false, e.message);
    }

    // Helper auth headers
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    // 2.1) Validate (roleLevel & currentUser)
    let roleLevel = 0;
    let currentUserId = null;
    try {
        const { res, json } = await httpJson('GET', '/api/auth/validate', { headers: authHeaders });
        const ok = res.status === 200 && json?.roleLevel >= 0 && json?.user?.id;
        if (ok) {
            roleLevel = json.roleLevel;
            currentUserId = json.user.id;
        }
        results.push(ok);
        logStep('Validate', ok, `status=${res.status}, roleLevel=${json?.roleLevel ?? 'n/a'}, userId=${json?.user?.id ?? 'n/a'}`);
    } catch (e) {
        results.push(false);
        logStep('Validate', false, e.message);
    }

    // 3) Dropdown (urunler)
    try {
        const { res, json } = await httpJson('GET', '/api/dropdown?category=urunler', { headers: authHeaders });
        const ok = res.status === 200 && Array.isArray(json?.data?.urunler);
        saveResponse('dropdown_urunler', { status: res.status, json });
        results.push(ok);
        logStep('Dropdown: urunler', ok, `status=${res.status}, count=${json?.data?.urunler?.length ?? 'n/a'}`);
    } catch (e) {
        results.push(false);
        logStep('Dropdown: urunler', false, e.message);
    }

    // 4) Cari listesi (limit=5)
    try {
        const { res, json } = await httpJson('GET', '/api/cari?limit=5', { headers: authHeaders });
        const ok = res.status === 200 && json?.success === true && Array.isArray(json?.customers);
        saveResponse('cari_list_limit5', { status: res.status, json });
        if (ok && json.customers.length > 0) {
            // Cari detayını test etmek için ilk id'yi sakla
            firstRecipeId = firstRecipeId; // noop to keep variable referenced
            globalThis.__firstCariId = json.customers[0].id;
        }
        results.push(ok);
        logStep('Cari listesi', ok, `status=${res.status}, count=${json?.customers?.length ?? 'n/a'}`);
    } catch (e) {
        results.push(false);
        logStep('Cari listesi', false, e.message);
    }

    // 4.1) Cari detay (GET)
    try {
        const cid = globalThis.__firstCariId;
        if (!cid) throw new Error('Cari yok');
        const { res, json } = await httpJson('GET', `/api/cari/${cid}`, { headers: authHeaders });
        const ok = res.status === 200 && json?.id === cid;
        saveResponse('cari_detay', { status: res.status, json });
        results.push(ok);
        logStep('Cari detay (GET)', ok, `status=${res.status}, id=${cid}`);
    } catch (e) {
        results.push(false);
        logStep('Cari detay (GET)', false, e.message);
    }

    // 4.2) Ürünler listesi (limit=5)
    try {
        const { res, json } = await httpJson('GET', '/api/urunler?limit=5', { headers: authHeaders });
        const ok = res.status === 200 && json?.success === true && Array.isArray(json?.products);
        saveResponse('urunler_limit5', { status: res.status, json });
        results.push(ok);
        logStep('Urunler listesi', ok, `status=${res.status}, count=${json?.products?.length ?? 'n/a'}`);
    } catch (e) {
        results.push(false);
        logStep('Urunler listesi', false, e.message);
    }

    // 5) Reçeteler listesi (limit=5)
    try {
        const { res, json } = await httpJson('GET', '/api/receteler?limit=5', { headers: authHeaders });
        const ok = res.status === 200 && json?.success === true && Array.isArray(json?.recipes);
        saveResponse('receteler_limit5', { status: res.status, json });
        if (ok && json.recipes.length > 0) firstRecipeId = json.recipes[0].id;
        results.push(ok);
        logStep('Reçeteler listesi', ok, `status=${res.status}, count=${json?.recipes?.length ?? 'n/a'}`);
    } catch (e) {
        results.push(false);
        logStep('Reçeteler listesi', false, e.message);
    }

    // 5.1) Reçete maliyet (GET)
    try {
        const rid = firstRecipeId || 1;
        const { res, json } = await httpJson('GET', `/api/receteler/maliyet?recipeId=${rid}`, { headers: authHeaders });
        const ok = res.status === 200 && json?.success === true && json?.data?.recipe?.id === rid;
        saveResponse('recete_maliyet_get', { status: res.status, json });
        results.push(ok);
        logStep('Reçete maliyet (GET)', ok, `status=${res.status}, recipeId=${rid}`);
    } catch (e) {
        results.push(false);
        logStep('Reçete maliyet (GET)', false, e.message);
    }

    // 5.2) Reçete maliyet hesapla (POST - updateStored=false)
    try {
        const rid = firstRecipeId || 1;
        const { res, json } = await httpJson('POST', '/api/receteler/maliyet', {
            headers: authHeaders,
            body: { recipeId: rid, portion: 1, updateStored: false }
        });
        const ok = res.status === 200 && json?.success === true && json?.data?.calculation?.totalCost >= 0;
        saveResponse('recete_maliyet_post', { status: res.status, json });
        results.push(ok);
        logStep('Reçete maliyet hesapla (POST)', ok, `status=${res.status}`);
    } catch (e) {
        results.push(false);
        logStep('Reçete maliyet hesapla (POST)', false, e.message);
    }

    // 6) Users path GET (id=9)
    try {
        const { res, json } = await httpJson('GET', '/api/auth/users/9', { headers: authHeaders });
        const expectOk = roleLevel >= 80;
        const ok = (expectOk && res.status === 200 && json?.success === true && json?.user?.id === 9)
            || (!expectOk && res.status === 403);
        saveResponse('users_get_9', { status: res.status, json });
        results.push(ok);
        logStep('Users GET /auth/users/9', ok, `status=${res.status}`);
    } catch (e) {
        results.push(false);
        logStep('Users GET /auth/users/9', false, e.message);
    }

    // 6.1) Users path PUT (403 beklenir - viewer)
    try {
        const { res } = await httpJson('PUT', '/api/auth/users/9', {
            headers: authHeaders,
            body: { ad: 'Degismez' }
        });
        const expectOk = roleLevel >= 80;
        const ok = (expectOk && res.status === 200) || (!expectOk && res.status === 403);
        saveResponse('users_put_9', { status: res.status });
        results.push(ok);
        logStep('Users PUT /auth/users/9 (forbidden)', ok, `status=${res.status}`);
    } catch (e) {
        results.push(false);
        logStep('Users PUT /auth/users/9 (forbidden)', false, e.message);
    }

    // 6.2) Users path DELETE (403 beklenir - viewer)
    try {
        const { res } = await httpJson('DELETE', '/api/auth/users/9', { headers: authHeaders });
        const isSelf = currentUserId === 9;
        const expectDelete = roleLevel >= 90 && !isSelf;
        const ok = (expectDelete && res.status === 200) || (!expectDelete && (res.status === 403 || res.status === 400));
        saveResponse('users_delete_9', { status: res.status });
        results.push(ok);
        logStep('Users DELETE /auth/users/9 (forbidden)', ok, `status=${res.status}`);
    } catch (e) {
        results.push(false);
        logStep('Users DELETE /auth/users/9 (forbidden)', false, e.message);
    }

    // 7) Users lifecycle (create -> get -> update -> delete) only for high-role
    if (roleLevel >= 90) {
        const ts = Date.now();
        let createdUserId = null;
        try {
            const body = {
                ad: 'Test',
                soyad: 'Kullanici',
                email: `test.user.${ts}@example.com`,
                username: `test_user_${ts}`,
                password: 'TestPass123!',
                rol: 'PERSONEL',
                aktif: true
            };
            const { res, json } = await httpJson('POST', '/api/auth/users', { headers: authHeaders, body });
            const ok = res.status === 201 && json?.success === true && json?.user?.id;
            saveResponse('users_create', { status: res.status, json });
            if (ok) createdUserId = json.user.id;
            results.push(ok);
            logStep('Users create (POST)', ok, `status=${res.status}, id=${createdUserId ?? 'n/a'}`);
        } catch (e) {
            results.push(false);
            logStep('Users create (POST)', false, e.message);
        }

        // Users path GET created
        try {
            if (!createdUserId) throw new Error('no created user');
            const { res, json } = await httpJson('GET', `/api/auth/users/${createdUserId}`, { headers: authHeaders });
            const ok = res.status === 200 && json?.success === true && json?.user?.id === createdUserId;
            saveResponse('users_get_created', { status: res.status, json });
            results.push(ok);
            logStep('Users GET created (path)', ok, `status=${res.status}`);
        } catch (e) {
            results.push(false);
            logStep('Users GET created (path)', false, e.message);
        }

        // Users path PUT update phone
        try {
            if (!createdUserId) throw new Error('no created user');
            const { res } = await httpJson('PUT', `/api/auth/users/${createdUserId}`, {
                headers: authHeaders,
                body: { telefon: '+905551112233' }
            });
            const ok = res.status === 200;
            saveResponse('users_update_created', { status: res.status });
            results.push(ok);
            logStep('Users UPDATE created (path)', ok, `status=${res.status}`);
        } catch (e) {
            results.push(false);
            logStep('Users UPDATE created (path)', false, e.message);
        }

        // Users path DELETE
        try {
            if (!createdUserId) throw new Error('no created user');
            const { res } = await httpJson('DELETE', `/api/auth/users/${createdUserId}`, { headers: authHeaders });
            const ok = res.status === 200;
            saveResponse('users_delete_created', { status: res.status });
            results.push(ok);
            logStep('Users DELETE created (path)', ok, `status=${res.status}`);
        } catch (e) {
            results.push(false);
            logStep('Users DELETE created (path)', false, e.message);
        }
    }

    // 8) Cari create/delete (cleanup)
    if (roleLevel >= 80) {
        const ts = Date.now();
        let cariId = null;
        try {
            const body = { cariAdi: `Test Cari ${ts}`, musteriKodu: `TC${ts}` };
            const { res, json } = await httpJson('POST', '/api/cari', { headers: authHeaders, body });
            const ok = res.status === 201 && json?.success === true && json?.customer?.id;
            saveResponse('cari_create', { status: res.status, json });
            if (ok) cariId = json.customer.id;
            results.push(ok);
            logStep('Cari create (POST)', ok, `status=${res.status}, id=${cariId ?? 'n/a'}`);
        } catch (e) {
            results.push(false);
            logStep('Cari create (POST)', false, e.message);
        }

        try {
            if (!cariId) throw new Error('no cari');
            const { res } = await httpJson('DELETE', '/api/cari', { headers: authHeaders, body: { id: cariId } });
            const ok = res.status === 200;
            saveResponse('cari_delete', { status: res.status });
            results.push(ok);
            logStep('Cari delete (DELETE)', ok, `status=${res.status}`);
        } catch (e) {
            results.push(false);
            logStep('Cari delete (DELETE)', false, e.message);
        }
    }

    // 9) Urun create/delete (cleanup)
    if (roleLevel >= 80) {
        const ts = Date.now();
        let urunId = null;
        try {
            const body = { ad: `Test Urun ${ts}`, kod: `UT${ts}` };
            const { res, json } = await httpJson('POST', '/api/urunler', { headers: authHeaders, body });
            const ok = res.status === 201 && json?.success === true && json?.product?.id;
            saveResponse('urun_create', { status: res.status, json });
            if (ok) urunId = json.product.id;
            results.push(ok);
            logStep('Urun create (POST)', ok, `status=${res.status}, id=${urunId ?? 'n/a'}`);
        } catch (e) {
            results.push(false);
            logStep('Urun create (POST)', false, e.message);
        }

        try {
            if (!urunId) throw new Error('no urun');
            const { res } = await httpJson('DELETE', '/api/urunler', { headers: authHeaders, body: { id: urunId } });
            const ok = res.status === 200;
            saveResponse('urun_delete', { status: res.status });
            results.push(ok);
            logStep('Urun delete (DELETE)', ok, `status=${res.status}`);
        } catch (e) {
            results.push(false);
            logStep('Urun delete (DELETE)', false, e.message);
        }
    }

    const passed = results.every(Boolean);
    console.log(`\nSmoke summary: ${results.filter(Boolean).length}/${results.length} passed`);
    process.exit(passed ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); }); 