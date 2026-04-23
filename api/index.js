const tmdbProxy = require('./tmdb');
const tvdbProxy = require('./tvdb');
const { setCorsHeaders, splitPathAndQuery, stripPrefix } = require('./lib/proxy-utils');

module.exports = async (req, res) => {
    const { pathAndQuery } = splitPathAndQuery(req.url || '/');

    const tmdbPath = stripPrefix(pathAndQuery, '/tmdb');
    if (tmdbPath !== null) {
        await tmdbProxy(req, res, { pathAndQuery: tmdbPath });
        return;
    }

    const tvdbPath = stripPrefix(pathAndQuery, '/tvdb');
    if (tvdbPath !== null) {
        await tvdbProxy(req, res, { pathAndQuery: tvdbPath });
        return;
    }

    setCorsHeaders(
        res,
        'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
        'Content-Type, Authorization, Accept, Accept-Language, If-None-Match, If-Modified-Since, X-API-Key'
    );

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    res.status(404).json({
        error: 'Not found',
        message: 'Use /tmdb/* or /tvdb/*'
    });
};
