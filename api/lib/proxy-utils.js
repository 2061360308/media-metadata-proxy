const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'content-length'
]);

function splitPathAndQuery(rawUrl = '/') {
    const [pathPart = '/', queryPart] = String(rawUrl || '/').split('?');
    let path = pathPart || '/';
    if (!path.startsWith('/')) {
        path = `/${path}`;
    }

    const query = queryPart ? `?${queryPart}` : '';
    return {
        path,
        query,
        pathAndQuery: `${path}${query}`
    };
}

function stripPrefix(pathAndQuery, prefix) {
    const { path, query } = splitPathAndQuery(pathAndQuery);
    const normalizedPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`;

    if (path === normalizedPrefix) {
        return `/${query}`;
    }

    if (!path.startsWith(`${normalizedPrefix}/`)) {
        return null;
    }

    const strippedPath = path.slice(normalizedPrefix.length);
    return `${strippedPath}${query}`;
}

function setCorsHeaders(res, methods, headers) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', headers);
}

function hasBody(method) {
    return !['GET', 'HEAD'].includes(method);
}

function buildForwardHeaders(req, headerAllowList) {
    const headers = {};
    headerAllowList.forEach((name) => {
        const value = req.headers[name];
        if (value !== undefined) {
            headers[name] = value;
        }
    });
    return headers;
}

function filterResponseHeaders(headers = {}) {
    const filtered = {};
    Object.entries(headers).forEach(([key, value]) => {
        if (value === undefined) {
            return;
        }

        if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
            return;
        }

        filtered[key] = value;
    });
    return filtered;
}

function applyResponseHeaders(res, headers = {}) {
    Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
    });
}

class TimedCache {
    constructor(durationMs, maxSize) {
        this.durationMs = durationMs;
        this.maxSize = maxSize;
        this.cache = new Map();
        this.timer = setInterval(() => this.cleanExpired(), this.durationMs);
        if (typeof this.timer.unref === 'function') {
            this.timer.unref();
        }
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }

        if (Date.now() >= entry.expiry) {
            this.cache.delete(key);
            return null;
        }

        return entry.value;
    }

    set(key, value) {
        this.evictIfNeeded();
        this.cache.set(key, {
            value,
            expiry: Date.now() + this.durationMs
        });
    }

    evictIfNeeded() {
        if (this.cache.size < this.maxSize) {
            return;
        }

        const entries = Array.from(this.cache.entries());
        entries.sort((a, b) => a[1].expiry - b[1].expiry);
        const deleteCount = this.cache.size - this.maxSize + 1;
        entries.slice(0, deleteCount).forEach(([key]) => this.cache.delete(key));
    }

    cleanExpired() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now >= entry.expiry) {
                this.cache.delete(key);
            }
        }
    }
}

function buildCacheKey(method, pathAndQuery, authorizationHeader) {
    return `${method}:${pathAndQuery}:auth=${authorizationHeader || ''}`;
}

module.exports = {
    TimedCache,
    applyResponseHeaders,
    buildCacheKey,
    buildForwardHeaders,
    filterResponseHeaders,
    hasBody,
    setCorsHeaders,
    splitPathAndQuery,
    stripPrefix
};
