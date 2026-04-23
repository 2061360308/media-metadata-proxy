const fs = require('fs');
const path = require('path');
let axios;
try {
    axios = require('axios');
} catch (error) {
    console.error('Missing dependency: axios');
    console.error('Please run: npm install');
    process.exit(1);
}

function loadEnvFile(envPath) {
    if (!fs.existsSync(envPath)) {
        return;
    }

    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }

        const separatorIndex = line.indexOf('=');
        if (separatorIndex <= 0) {
            continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        let value = line.slice(separatorIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

function normalizeBaseUrl(host) {
    let normalized = String(host || '').trim();
    if (!normalized) {
        return '';
    }

    if (!/^https?:\/\//i.test(normalized)) {
        normalized = `https://${normalized}`;
    }

    return normalized.replace(/\/+$/, '');
}

function maskUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        if (url.searchParams.has('api_key')) {
            url.searchParams.set('api_key', '***');
        }
        return url.toString();
    } catch {
        return rawUrl;
    }
}

function bufferPreview(buffer, contentType) {
    const isText =
        /json|text|xml|javascript|x-www-form-urlencoded/i.test(contentType || '');

    if (!isText) {
        return '';
    }

    const text = Buffer.from(buffer).toString('utf8');
    if (!text) {
        return '';
    }

    let preview = text;
    if (/json/i.test(contentType || '')) {
        try {
            const parsed = JSON.parse(text);
            if (parsed && parsed.data && parsed.data.token) {
                parsed.data.token = '[REDACTED_TOKEN]';
            }
            preview = JSON.stringify(parsed);
        } catch {
            preview = text;
        }
    }

    if (preview.length > 600) {
        return `${preview.slice(0, 600)}...`;
    }
    return preview;
}

function statusIn2xx(status) {
    return status >= 200 && status < 300;
}

async function runTestCase(testCase, timeoutMs) {
    const response = await axios({
        method: testCase.method,
        url: testCase.url,
        headers: testCase.headers,
        data: testCase.data,
        timeout: timeoutMs,
        responseType: 'arraybuffer',
        validateStatus: () => true,
        decompress: true
    });

    const contentType = response.headers['content-type'] || '';
    const bodyBuffer = Buffer.from(response.data || []);
    const preview = bufferPreview(bodyBuffer, contentType);
    const success2xx = statusIn2xx(response.status);

    let passed = false;
    let expectation = '';
    if (testCase.expect === 'success') {
        passed = success2xx;
        expectation = 'expect 2xx';
    } else if (testCase.expect === 'error') {
        passed = !success2xx && preview.length > 0;
        expectation = 'expect non-2xx with readable error body';
    } else {
        passed = success2xx;
        expectation = 'expect 2xx';
    }

    return {
        name: testCase.name,
        method: testCase.method,
        url: testCase.url,
        maskedUrl: maskUrl(testCase.url),
        status: response.status,
        contentType,
        bytes: bodyBuffer.length,
        preview,
        passed,
        expectation
    };
}

async function main() {
    const envPath = path.join(__dirname, '.env');
    loadEnvFile(envPath);

    const proxyHost = process.env.PROXY_HOST;
    if (!proxyHost || !proxyHost.trim()) {
        console.error('Missing required config: PROXY_HOST');
        console.error('Please copy scripts/.env.example to scripts/.env and set PROXY_HOST.');
        process.exit(1);
    }

    const baseUrl = normalizeBaseUrl(proxyHost);
    const tvdbApiKey = (process.env.TVDB_API_KEY || '').trim();
    const tvdbPin = (process.env.TVDB_PIN || '').trim();
    const tvdbArtworkPathRaw = (
        process.env.TVDB_ARTWORK_PATH ||
        'banners/movies/103937/backgrounds/103937.jpg'
    ).trim();
    const tmdbApiKey = (process.env.TMDB_API_KEY || '').trim();
    const movieId = (process.env.TMDB_MOVIE_ID || '109445').trim();
    const imagePathRaw = (process.env.TMDB_IMAGE_PATH || 'piD4UjudoM5AfBAO3Rzy8IEuWsH.jpg').trim();
    const imageSize = (process.env.TMDB_IMAGE_SIZE || 'original').trim();
    const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || '30000');

    const appendToResponse =
        process.env.TMDB_APPEND_TO_RESPONSE ||
        'alternative_titles,reviews,casts,releases,images,keywords,trailers';
    const includeImageLanguage =
        process.env.TMDB_INCLUDE_IMAGE_LANGUAGE || 'zh-CN,null';

    const movieQuery = new URLSearchParams();
    movieQuery.set('append_to_response', appendToResponse);
    movieQuery.set('language', 'zh-CN');
    movieQuery.set('include_image_language', includeImageLanguage);
    if (tmdbApiKey) {
        movieQuery.set('api_key', tmdbApiKey);
    }

    let normalizedImagePath = imagePathRaw.replace(/^\/+/, '');
    if (normalizedImagePath.startsWith('t/p/')) {
        normalizedImagePath = normalizedImagePath.slice(4);
    }
    const imageSuffix = imageSize ? `${imageSize}/${normalizedImagePath}` : normalizedImagePath;
    const tvdbArtworkPath = tvdbArtworkPathRaw.replace(/^\/+/, '');

    const tvdbBody = {};
    if (tvdbApiKey) {
        tvdbBody.apikey = tvdbApiKey;
    }
    if (tvdbPin) {
        tvdbBody.pin = tvdbPin;
    }

    const tests = [
        {
            name: 'TVDB Login',
            method: 'POST',
            url: `${baseUrl}/tvdb/v4/login`,
            headers: {
                'Content-Type': 'application/json',
                'Accept-Encoding': 'deflate'
            },
            data: tvdbBody,
            expect: tvdbApiKey ? 'success' : 'error'
        },
        {
            name: 'TMDB Movie Detail',
            method: 'GET',
            url: `${baseUrl}/tmdb/3/movie/${encodeURIComponent(movieId)}?${movieQuery.toString()}`,
            headers: {
                Accept: 'application/json,image/*',
                'User-Agent': 'Emby/4.9.3.0',
                'Accept-Encoding': 'deflate'
            },
            expect: tmdbApiKey ? 'success' : 'error'
        },
        {
            name: 'TMDB Image',
            method: 'GET',
            url: `${baseUrl}/tmdb/t/p/${imageSuffix}`,
            headers: {
                Accept: 'image/*',
                'User-Agent': 'Emby/4.9.3.0',
                'Accept-Encoding': 'deflate'
            },
            expect: 'success'
        },
        {
            name: 'TVDB Artwork',
            method: 'GET',
            url: `${baseUrl}/tvdb/artworks/${tvdbArtworkPath}`,
            headers: {
                Accept: 'image/*',
                'User-Agent': 'Emby/4.9.3.0',
                'Accept-Encoding': 'deflate'
            },
            expect: 'success'
        }
    ];

    console.log(`Proxy base URL: ${baseUrl}`);
    console.log(`TVDB_API_KEY set: ${tvdbApiKey ? 'yes' : 'no'}`);
    console.log(`TMDB_API_KEY set: ${tmdbApiKey ? 'yes' : 'no'}`);
    console.log('');

    const results = [];
    for (const testCase of tests) {
        try {
            const result = await runTestCase(testCase, timeoutMs);
            results.push(result);

            console.log(`=== ${result.name} ===`);
            console.log(`Method: ${result.method}`);
            console.log(`URL: ${result.maskedUrl}`);
            console.log(`Status: ${result.status} (${result.expectation})`);
            console.log(`Content-Type: ${result.contentType || '(none)'}`);
            console.log(`Body-Bytes: ${result.bytes}`);
            if (result.preview) {
                console.log(`Preview: ${result.preview}`);
            }
            console.log(`Result: ${result.passed ? 'PASS' : 'FAIL'}`);
            console.log('');
        } catch (error) {
            const msg = error && error.message ? error.message : String(error);
            results.push({
                name: testCase.name,
                passed: false,
                status: -1,
                error: msg
            });

            console.log(`=== ${testCase.name} ===`);
            console.log(`Method: ${testCase.method}`);
            console.log(`URL: ${maskUrl(testCase.url)}`);
            console.log('Status: REQUEST_ERROR');
            console.log(`Error: ${msg}`);
            console.log('Result: FAIL');
            console.log('');
        }
    }

    const failed = results.filter((item) => !item.passed);
    if (failed.length > 0) {
        console.log('Test summary: FAIL');
        console.log(`Failed requests: ${failed.map((item) => item.name).join(', ')}`);
        process.exit(1);
    }

    console.log('Test summary: PASS');
}

main().catch((error) => {
    const msg = error && error.message ? error.message : String(error);
    console.error(`Unexpected error: ${msg}`);
    process.exit(1);
});
