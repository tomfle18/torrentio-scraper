import axios from 'axios';
import crypto from 'crypto';
import { toStreamInfo } from './streamInfo.js';

const SALT = 'debridmediamanager.com%%fe7#td00rA3vHz%VmI';
const REGEX_PATTERN = /(\b(adl|agusiq|al3x|ale13|alusia|as76|azjatycki|azq|b89|bida|chrisvps|d11|denda|dsite|elladajarek|emis|enter1973|esperanza|eteam|feld|fiona9|gamer158|ghn|gr4pe|h3q|hmdb|intgrity|j60|joanna668|k83|kit|kolekcja|komplet|kpfr|ksq|lektor|ltn|m80|marcin0313|maxim|mg|mixio|mowy|napiproject|napisy|napisypl|nn|nonano|noq|ozw|p2p|paczka|pl|pl_1080p_web|pldub|plsub|pol|polish|psig|r22|r68|ralf|robsil|rx|s56|sezon|sfpi|sharpe|sk13|spajk85|spedboy|starlord|starlordx|superseed|syntezator|syrix|tfsh|tłumacz|toalien|topfilmyfilmweb|torrentmaniak|vantablack|wasik|wilu75|wersja|xupload|zbyszek|electro-torrent|devil-torrents|polskie-torrenty|cool-torents|ex-torrenty)\b)|(ą|ć|ę|ł|ń|ś|ź|ż)/i;
const MAGNET_PREFIX = "magnet:?xt=urn:btih:";

function toSigned32(n) {
    return n | 0;
}

function imul(a, b) {
    const aHi = (a >>> 16) & 0xffff;
    const aLo = a & 0xffff;
    const bHi = (b >>> 16) & 0xffff;
    const bLo = b & 0xffff;
    return toSigned32((aLo * bLo) + (((aHi * bLo + aLo * bHi) << 16) >>> 0));
}

async function fetchTimestamp() {
    try {
        const response = await axios.get('https://api.real-debrid.com/rest/1.0/time/iso', { timeout: 10000 });
        const isoTimeStr = response.data;
        return Math.floor(new Date(isoTimeStr).getTime() / 1000);
    } catch (e) {
        console.error(`Błąd podczas pobierania znacznika czasu: ${e}`);
        throw e;
    }
}

function generateRandomToken() {
    return crypto.randomBytes(4).toString('hex');
}

function generateHash(s) {
    let hash1 = toSigned32(0xdeadbeef ^ s.length);
    let hash2 = toSigned32(0x41c6ce57 ^ s.length);

    for (let i = 0; i < s.length; i++) {
        const charCode = s.charCodeAt(i);
        hash1 = imul(hash1 ^ charCode, 2654435761);
        hash2 = imul(hash2 ^ charCode, 1597334677);
        hash1 = toSigned32((hash1 << 5) | (hash1 >>> 27));
        hash2 = toSigned32((hash2 << 5) | (hash2 >>> 27));
    }

    hash1 = toSigned32(hash1 + imul(hash2, 1566083941));
    hash2 = toSigned32(hash2 + imul(hash1, 2024237689));

    const finalVal = (hash1 ^ hash2) >>> 0;
    return finalVal.toString(16);
}

function combineHashes(hash1, hash2) {
    const halfLength = Math.floor(hash1.length / 2);
    const firstPart1 = hash1.substring(0, halfLength);
    const secondPart1 = hash1.substring(halfLength);
    const firstPart2 = hash2.substring(0, halfLength);
    const secondPart2 = hash2.substring(halfLength);

    let obfuscated = '';
    for (let i = 0; i < firstPart1.length; i++) {
        obfuscated += firstPart1[i] + firstPart2[i];
    }
    obfuscated += secondPart2.split('').reverse().join('') + secondPart1.split('').reverse().join('');
    return obfuscated;
}

async function generateTokenAndHash() {
    const token = generateRandomToken();
    const timestamp = await fetchTimestamp();
    const tokenWithTimestamp = `${token}-${timestamp}`;
    const tokenTimestampHash = generateHash(tokenWithTimestamp);
    const tokenSaltHash = generateHash(`${SALT}-${token}`);
    const combinedHash = combineHashes(tokenTimestampHash, tokenSaltHash);
    return { problemKey: tokenWithTimestamp, solution: combinedHash };
}

async function fetchAllPages(imdbId, problemKey, solution, contentType, seasonNum = null) {
    const baseUrl = `https://debridmediamanager.com/api/torrents/${contentType}`;
    let pageCounter = 0;
    const allResults = [];

    while (true) {
        const params = {
            imdbId: imdbId,
            dmmProblemKey: problemKey,
            solution: solution,
            onlyTrusted: 'false',
            maxSize: '0',
            page: pageCounter.toString()
        };
        if (contentType === 'tv' && seasonNum) {
            params.seasonNum = seasonNum;
        }

        try {
            const response = await axios.get(baseUrl, { params: params, timeout: 20000 });
            const currentResults = response.data.results || [];
            if (!currentResults.length) {
                break;
            }
            allResults.push(...currentResults);
            pageCounter++;
        } catch (e) {
            console.error(`Błąd podczas wysyłania zapytania na stronie ${pageCounter}: ${e}`);
            break;
        }
    }
    return allResults;
}

function filterResults(allResults) {
    if (!allResults) return [];
    return allResults.filter(item => item.title && item.hash && REGEX_PATTERN.test(item.title));
}

function removeDuplicateHashes(results) {
    if (!results) return [];
    const uniqueResults = [];
    const seenHashes = new Set();
    for (const item of results) {
        if (item.hash && !seenHashes.has(item.hash)) {
            seenHashes.add(item.hash);
            uniqueResults.push(item);
        }
    }
    return uniqueResults;
}

export async function getStreams(id, type) {
    const { problemKey, solution } = await generateTokenAndHash();
    const parts = id.split(':');
    const imdbId = parts[0];
    let seasonNum = null;
    let contentType = 'movie';

    if (type === 'series') {
        contentType = 'tv';
        seasonNum = parts[1];
    }

    const allApiResults = await fetchAllPages(imdbId, problemKey, solution, contentType, seasonNum);
    const filteredResults = filterResults(allApiResults);
    const uniqueResults = removeDuplicateHashes(filteredResults);

    // Konwersja do formatu oczekiwanego przez addon
    return uniqueResults.map(item => {
        return toStreamInfo({
            infoHash: item.hash,
            fileIndex: null, // DMM API nie dostarcza fileIndex, więc ustawiamy null
            title: item.title,
            size: item.size,
            torrent: {
                title: item.title,
                seeders: item.seeders,
                provider: 'DMM',
                trackers: '',
                uploadDate: new Date()
            }
        });
    });
}
