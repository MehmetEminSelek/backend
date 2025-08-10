// API Sanity Test - run: node tests/api-sanity.js
// Uses Node 18+ global fetch

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

function log(name, ok, extra = '') {
    console.log(`- ${name}: ${ok ? 'OK' : 'FAIL'}${extra ? ' - ' + extra : ''}`)
}

async function http(method, path, opts = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = null }
    return { res, json, text }
}

async function run() {
    const results = []

    // Login to get token
    let token = null
    try {
        const { res, json } = await http('POST', '/api/auth/login', {
            body: { kullaniciAdi: 'baris.gullu', sifre: 'bar123' }
        })
        const ok = res.status === 200 && json?.accessToken
        token = ok ? json.accessToken : null
        results.push(ok)
        log('Auth: login', ok, `status=${res.status}`)
    } catch (e) {
        results.push(false)
        log('Auth: login', false, e.message)
    }

    const H = token ? { Authorization: `Bearer ${token}` } : {}

    // Health
    try {
        const { res } = await http('GET', '/api/health')
        const ok = res.status === 200
        results.push(ok)
        log('Health', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Health', false, e.message) }

    // Dropdowns
    try {
        const { res } = await http('GET', '/api/dropdown', { headers: H })
        const ok = res.status === 200
        results.push(ok)
        log('Dropdown', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Dropdown', false, e.message) }

    // Users list
    try {
        const { res } = await http('GET', '/api/auth/users', { headers: H })
        const ok = res.status === 200
        results.push(ok)
        log('Users list', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Users list', false, e.message) }

    // Fetch a recipe id for further tests
    let firstRecipeId = null
    // Cari list
    try {
        const { res } = await http('GET', '/api/cari?limit=5', { headers: H })
        const ok = res.status === 200
        results.push(ok)
        log('Cari list', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Cari list', false, e.message) }

    // Urunler list
    try {
        const { res } = await http('GET', '/api/urunler?limit=5', { headers: H })
        const ok = res.status === 200
        results.push(ok)
        log('Urunler list', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Urunler list', false, e.message) }

    // Materials list
    try {
        const { res } = await http('GET', '/api/materials', { headers: H })
        const ok = res.status === 200
        results.push(ok)
        log('Materials list', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Materials list', false, e.message) }

    // Receteler list
    try {
        const { res, json } = await http('GET', '/api/receteler?limit=1', { headers: H })
        const ok = res.status === 200
        if (ok && Array.isArray(json?.recipes) && json.recipes.length > 0) {
            firstRecipeId = json.recipes[0].id
        }
        results.push(ok)
        log('Receteler list', ok, `status=${res.status}, firstId=${firstRecipeId ?? 'n/a'}`)
    } catch (e) { results.push(false); log('Receteler list', false, e.message) }

    // Recete maliyet (GET)
    try {
        const path = firstRecipeId ? `/api/receteler/maliyet?recipeId=${firstRecipeId}` : '/api/receteler/maliyet?recipeId=1'
        const { res } = await http('GET', path, { headers: H })
        const ok = res.status === 200 || res.status === 404 // 404 olabilir: id yoksa
        results.push(ok)
        log('Recete maliyet GET', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Recete maliyet GET', false, e.message) }

    // Orders placeholder
    try {
        const { res } = await http('GET', '/api/orders', { headers: H })
        const ok = res.status === 200
        results.push(ok)
        log('Orders list', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Orders list', false, e.message) }

    // Siparis placeholder
    try {
        const { res } = await http('GET', '/api/siparis', { headers: H })
        const ok = res.status === 200
        results.push(ok)
        log('Siparis list', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Siparis list', false, e.message) }

    // Orders PUT (basic status update test)
    try {
        const { json: listJson } = await http('GET', '/api/siparis?limit=1', { headers: H })
        const anyId = listJson?.orders?.[0]?.id || listJson?.orders?.[0]?.id
        if (anyId) {
            const { res } = await http('PUT', '/api/siparis', { headers: H, body: { id: anyId, durum: 'HAZIRLANDI' } })
            const ok = res.status === 200 || res.status === 403
            results.push(ok)
            log('Siparis PUT', ok, `status=${res.status}`)
        } else {
            results.push(true)
            log('Siparis PUT', true, 'skip (no orders)')
        }
    } catch (e) { results.push(false); log('Siparis PUT', false, e.message) }

    // Hazirlanacak placeholder
    try {
        const { res } = await http('GET', '/api/hazirlanacak', { headers: H })
        const ok = res.status === 200
        results.push(ok)
        log('Hazirlanacak', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Hazirlanacak', false, e.message) }

    // Satis raporu
    try {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString();
        const { res } = await http('POST', '/api/satis-raporu', { headers: H, body: { startDate: start, endDate: end } })
        const ok = res.status === 200
        results.push(ok)
        log('Satis raporu', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Satis raporu', false, e.message) }

    // CRM raporlama
    try {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString();
        const { res } = await http('POST', '/api/crm-raporlama', { headers: H, body: { startDate: start, endDate: end } })
        const ok = res.status === 200
        results.push(ok)
        log('CRM raporlama', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('CRM raporlama', false, e.message) }

    // Uretim plani
    try {
        const { res } = await http('GET', '/api/uretim-plani', { headers: H })
        const ok = res.status === 200
        results.push(ok)
        log('Uretim plani', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Uretim plani', false, e.message) }

    // Kargo durumlari
    try {
        const { res } = await http('GET', '/api/kargo-durumlari', { headers: H })
        const ok = res.status === 200
        results.push(ok)
        log('Kargo durumlari', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Kargo durumlari', false, e.message) }

    // Malzeme fiyatlari
    try {
        const { res } = await http('GET', '/api/malzeme-fiyatlari', { headers: H })
        const ok = res.status === 200
        results.push(ok)
        log('Malzeme fiyatlari', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Malzeme fiyatlari', false, e.message) }

    // Audit logs (yetki gerektirir)
    try {
        const { res } = await http('GET', '/api/audit-logs', { headers: H })
        const ok = res.status === 200 || res.status === 403 // ortama göre
        results.push(ok)
        log('Audit logs', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Audit logs', false, e.message) }

    // Cari adresleri (ilk cariden)
    try {
        // İlk cari id’yi almak için tekrar küçük bir istek yapalım
        const { json } = await http('GET', '/api/cari?limit=1', { headers: H })
        const firstCariId = Array.isArray(json?.customers) && json.customers[0]?.id ? json.customers[0].id : null
        const path = firstCariId ? `/api/cari/${firstCariId}/adres` : '/api/cari/1/adres'
        const { res } = await http('GET', path, { headers: H })
        const ok = res.status === 200 || res.status === 404
        results.push(ok)
        log('Cari adresleri', ok, `status=${res.status}`)
    } catch (e) { results.push(false); log('Cari adresleri', false, e.message) }

    const passed = results.filter(Boolean).length
    console.log(`\nAPI Sanity: ${passed}/${results.length} passed`)
    process.exit(passed === results.length ? 0 : 1)
}

run().catch(e => { console.error(e); process.exit(1) }) 