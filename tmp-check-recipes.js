const fetch = global.fetch;
async function http(method, path, opts = {}) {
    const res = await fetch(`http://localhost:3000${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { }
    return { res, json, text };
}
(async () => {
    const login = await http('POST', '/api/auth/login', { body: { kullaniciAdi: 'baris.gullu', sifre: 'bar123' } });
    console.log('login', login.res.status, !!login.json?.accessToken);
    const token = login.json?.accessToken;
    const H = token ? { Authorization: 'Bearer ' + token } : {};
    const rec = await http('GET', '/api/receteler?limit=3', { headers: H });
    console.log('rec status', rec.res.status);
    if (rec.json) {
        console.log('keys', Object.keys(rec.json));
        console.log('counts', { recipes: rec.json.recipes?.length, legacy: rec.json.legacy?.length });
        if (Array.isArray(rec.json.recipes) && rec.json.recipes.length) {
            const r0 = rec.json.recipes[0];
            console.log('r0 fields', Object.keys(r0));
            console.log('r0.icerikelek len', Array.isArray(r0.icerikelek) ? r0.icerikelek.length : null);
            console.log('r0.icerikelek sample', Array.isArray(r0.icerikelek) ? r0.icerikelek.slice(0, 2) : null);
        }
        if (Array.isArray(rec.json.legacy) && rec.json.legacy.length) {
            const l0 = rec.json.legacy[0];
            console.log('legacy0', l0.name, l0.ingredients?.length, l0.ingredients?.slice(0, 2));
        }
    } else {
        console.log('text', rec.text);
    }
})();
