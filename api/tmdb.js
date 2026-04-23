const axios = require('axios');
const {
    TimedCache,
    applyResponseHeaders,
    buildCacheKey,
    buildForwardHeaders,
    filterResponseHeaders,
    hasBody,
    setCorsHeaders
} = require('./lib/proxy-utils');

const TMDB_BASE_URL = 'https://api.themoviedb.org';
const CACHE_DURATION = 10 * 60 * 1000;
const MAX_CACHE_SIZE = 1000;
const cache = new TimedCache(CACHE_DURATION, MAX_CACHE_SIZE);

const FORWARD_HEADERS = [
    'accept',
    'accept-language',
    'authorization',
    'content-type',
    'if-match',
    'if-none-match',
    'if-modified-since'
];

module.exports = async (req, res, context = {}) => {
    setCorsHeaders(
        res,
        'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
        'Content-Type, Authorization, Accept, Accept-Language, If-None-Match, If-Modified-Since'
    );

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    const method = String(req.method || 'GET').toUpperCase();
    const pathAndQuery = context.pathAndQuery || req.url || '/';
    const authorizationHeader = req.headers.authorization;

    try {
        const cacheKey = buildCacheKey(method, pathAndQuery, authorizationHeader);
        if (method === 'GET') {
            const cached = cache.get(cacheKey);
            if (cached) {
                applyResponseHeaders(res, cached.headers);
                res.status(200).send(cached.body);
                return;
            }
        }

        const forwardHeaders = buildForwardHeaders(req, FORWARD_HEADERS);
        const response = await axios({
            method,
            url: `${TMDB_BASE_URL}${pathAndQuery}`,
            headers: forwardHeaders,
            data: hasBody(method) ? req.body : undefined,
            responseType: 'arraybuffer',
            timeout: 30000,
            validateStatus: () => true
        });

        const responseHeaders = filterResponseHeaders(response.headers);
        applyResponseHeaders(res, responseHeaders);

        const responseBuffer = Buffer.from(response.data || []);
        if (method === 'GET' && response.status === 200) {
            cache.set(cacheKey, {
                body: responseBuffer,
                headers: responseHeaders
            });
        }

        res.status(response.status).send(responseBuffer);
    } catch (error) {
        console.error('TMDB proxy error:', error.message);

        if (error.response) {
            const upstreamHeaders = filterResponseHeaders(error.response.headers || {});
            applyResponseHeaders(res, upstreamHeaders);
            const upstreamBody = Buffer.from(error.response.data || []);
            res.status(error.response.status || 500).send(upstreamBody);
            return;
        }

        res.status(502).json({
            error: 'Bad gateway',
            details: error.message
        });
    }
};
