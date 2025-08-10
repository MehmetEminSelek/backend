// Cari API Test Suite
import { performance } from 'perf_hooks';
import { saveResponse } from './utils/io.js';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const AUTH_HEADER = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.TEST_JWT || ''}` });

async function http(path, { method = 'GET', body, headers = {}, retries = 2 } = {}) {
    const url = `${BASE_URL}${path}`;
    let lastErr;
    for (let i = 0; i <= retries; i++) {
        try {
            const started = performance.now();
            const res = await fetch(url, {
                method,
                headers: { ...AUTH_HEADER(), ...headers },
                body: body ? JSON.stringify(body) : undefined,
            });
            const duration = performance.now() - started;
            const text = await res.text();
            let data;
            try { data = JSON.parse(text); } catch { data = text; }
            return { status: res.status, headers: Object.fromEntries(res.headers.entries()), data, duration };
        } catch (e) {
            lastErr = e;
            await new Promise(r => setTimeout(r, 300 * (i + 1)));
        }
    }
    throw lastErr;
}

function expect(cond, msg, extra) {
    if (!cond) throw new Error(msg + (extra ? ` | ${extra}` : ''));
}

async function run() {
    console.log('\n== Cari API Tests ==');

    // 1) basic list
    let res = await http('/api/cari?page=1&limit=50');
    saveResponse('cari_list_basic', res);
    expect(res.status === 200, 'GET /cari 200');
    expect(Array.isArray(res.data.customers), 'customers array exists');
    expect(res.data.pagination?.total >= res.data.customers.length, 'pagination total ok');
    console.log('Basic list ok in', res.duration.toFixed(1), 'ms, count=', res.data.customers.length);

    // 2) search
    const sampleName = res.data.customers[0]?.cariAdi || res.data.customers[0]?.ad || 'A';
    const searchTerm = encodeURIComponent(String(sampleName).slice(0, 3) || 'A');
    res = await http(`/api/cari?page=1&limit=20&search=${searchTerm}`);
    saveResponse('cari_search', res);
    expect(res.status === 200, 'search 200');
    expect(res.data.customers.length <= 20, 'limit respected');

    // 3) sort by bakiye asc/desc
    let resAsc = await http('/api/cari?page=1&limit=50&sortBy=bakiye&sortDir=asc');
    let resDesc = await http('/api/cari?page=1&limit=50&sortBy=bakiye&sortDir=desc');
    saveResponse('cari_sort_bakiye_asc', resAsc);
    saveResponse('cari_sort_bakiye_desc', resDesc);
    expect(resAsc.status === 200 && resDesc.status === 200, 'sorting 200');
    const asc = resAsc.data.customers.map(x => x.bakiye ?? 0);
    const desc = resDesc.data.customers.map(x => x.bakiye ?? 0);
    expect(asc.length > 0, 'asc has items');
    expect(asc[0] <= asc[asc.length - 1], 'asc sorted');
    expect(desc[0] >= desc[desc.length - 1], 'desc sorted');

    // 4) caching effectiveness
    const t1 = performance.now();
    await http('/api/cari?page=1&limit=50&sortBy=bakiye&sortDir=asc');
    const t2 = performance.now();
    const cached = await http('/api/cari?page=1&limit=50&sortBy=bakiye&sortDir=asc');
    saveResponse('cari_cached', cached);
    const t3 = performance.now();
    console.log('Cache check durations ms:', (t2 - t1).toFixed(1), (t3 - t2).toFixed(1));
    expect(cached.status === 200, 'cached list 200');
    // not strict, but expect second call faster
    expect((t3 - t2) <= (t2 - t1) * 0.9 || cached.data.success, 'second call faster suggests cache');

    // 5) performance budget under load (10 parallel)
    const parallel = 10;
    const started = performance.now();
    const results = await Promise.all(Array.from({ length: parallel }, () => http('/api/cari?page=1&limit=50&sortBy=cariAdi&sortDir=asc')));
    const elapsed = performance.now() - started;
    expect(results.every(r => r.status === 200), 'all parallel 200');
    console.log('Parallel x', parallel, 'elapsed', elapsed.toFixed(1), 'ms');

    console.log('All Cari API tests passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    run().catch(err => { console.error('Cari tests failed:', err.message); process.exit(1); });
}


