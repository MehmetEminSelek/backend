import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('tests/output');

function ensureDir() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
}

function redact(value, keysToMask = ['accessToken', 'refreshToken', 'token', 'password']) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(v => redact(v, keysToMask));
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (keysToMask.includes(k)) {
                out[k] = '***REDACTED***';
            } else {
                out[k] = redact(v, keysToMask);
            }
        }
        return out;
    }
    return value;
}

export function saveResponse(label, data, opts = {}) {
    try {
        ensureDir();
        const ts = new Date();
        const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}${String(ts.getSeconds()).padStart(2, '0')}`;
        const safeLabel = label.replace(/[^a-zA-Z0-9-_]/g, '_');
        const file = path.join(OUTPUT_DIR, `${stamp}_${safeLabel}.json`);
        const redacted = redact(data, opts.maskKeys || undefined);
        fs.writeFileSync(file, JSON.stringify(redacted, null, 2));
        if (process.env.SHOW_RESP === '1') {
            console.log(`\n=== ${label} ===`);
            console.log(JSON.stringify(redacted, null, 2));
        } else {
            console.log(`💾 Saved response → ${file}`);
        }
    } catch (e) {
        console.warn('Could not save response for', label, e.message);
    }
}


