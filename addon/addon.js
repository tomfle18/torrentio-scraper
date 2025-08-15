import { addonBuilder } from 'stremio-addon-sdk';
import { Type } from './lib/types.js';
import { dummyManifest } from './lib/manifest.js';
import { toStreamInfo, applyStaticInfo } from './lib/streamInfo.js';
import * as dmm from './lib/dmm.js';
import applySorting from './lib/sort.js';
import applyFilters from './lib/filter.js';
import { applyMochs, getMochCatalog, getMochItemMeta } from './moch/moch.js';
import StaticLinks from './moch/static.js';
import { createNamedQueue } from "./lib/namedQueue.js";
import pLimit from "p-limit";

const CACHE_MAX_AGE = parseInt(process.env.CACHE_MAX_AGE) || 60 * 60; // 1 hour in seconds
const CACHE_MAX_AGE_EMPTY = 60; // 60 seconds
const CATALOG_CACHE_MAX_AGE = 0; // 0 minutes
const STALE_REVALIDATE_AGE = 4 * 60 * 60; // 4 hours
const STALE_ERROR_AGE = 7 * 24 * 60 * 60; // 7 days

const builder = new addonBuilder(dummyManifest());
const requestQueue = createNamedQueue(Infinity);
const newLimiter = pLimit(30);

builder.defineStreamHandler((args) => {
  if (!args.id.match(/tt\d+/i) && !args.id.match(/kitsu:\d+/i)) {
    return Promise.resolve({ streams: [] });
  }

  console.log(`[ADDON DEBUG] Rozpoczynam przetwarzanie dla ID: ${args.id}`);

  return requestQueue.wrap(args.id, () => dmm.getStreams(args.id, args.type))
      .then(streams => {
        console.log(`[ADDON DEBUG] Pobrane strumienie z DMM: ${streams.length}`);
        if (streams.length > 0) console.log('[ADDON DEBUG] Pierwszy strumień z DMM:', JSON.stringify(streams[0], null, 2));
        return applyFilters(streams, args.extra);
      })
      .then(streams => {
        console.log(`[ADDON DEBUG] Strumienie po filtracji: ${streams.length}`);
        if (streams.length > 0) console.log('[ADDON DEBUG] Pierwszy strumień po filtracji:', JSON.stringify(streams[0], null, 2));
        return applySorting(streams, args.extra, args.type);
      })
      .then(streams => {
        console.log(`[ADDON DEBUG] Strumienie po sortowaniu: ${streams.length}`);
        if (streams.length > 0) console.log('[ADDON DEBUG] Pierwszy strumień po sortowaniu:', JSON.stringify(streams[0], null, 2));
        return applyStaticInfo(streams);
      })
      .then(streams => {
        console.log(`[ADDON DEBUG] Strumienie po applyStaticInfo: ${streams.length}`);
        return applyMochs(streams, args.extra);
      })
      .then(streams => {
        console.log(`[ADDON DEBUG] Strumienie po applyMochs: ${streams.length}`);
        return enrichCacheParams(streams);
      })
      .catch(error => {
        console.error(`[ADDON DEBUG] Błąd podczas przetwarzania żądania dla ${args.id}: ${error}`);
        return Promise.reject(`Failed request ${args.id}: ${error}`);
      });
});

builder.defineCatalogHandler((args) => {
  const [_, mochKey, catalogId] = args.id.split('-');
  console.log(`Incoming catalog ${args.id} request with skip=${args.extra.skip || 0}`)
  return getMochCatalog(mochKey, catalogId, args.extra)
      .then(metas => ({
        metas: metas,
        cacheMaxAge: CATALOG_CACHE_MAX_AGE
      }))
      .catch(error => {
        return Promise.reject(`Failed retrieving catalog ${args.id}: ${JSON.stringify(error.message || error)}`);
      });
})

builder.defineMetaHandler((args) => {
  const [mochKey, metaId] = args.id.split(':');
  console.log(`Incoming debrid meta ${args.id} request`)
  return getMochItemMeta(mochKey, metaId, args.extra)
      .then(meta => ({
        meta: meta,
        cacheMaxAge: metaId === 'Downloads' ? 0 : CACHE_MAX_AGE
      }))
      .catch(error => {
        return Promise.reject(`Failed retrieving catalog meta ${args.id}: ${JSON.stringify(error)}`);
      });
})

function enrichCacheParams(streams) {
  let cacheAge = CACHE_MAX_AGE;
  if (!streams.length) {
    cacheAge = CACHE_MAX_AGE_EMPTY;
  } else if (streams.every(stream => stream?.url?.endsWith(StaticLinks.FAILED_ACCESS))) {
    cacheAge = 0;
  }
  return {
    streams: streams,
    cacheMaxAge: cacheAge,
    staleRevalidate: STALE_REVALIDATE_AGE,
    staleError: STALE_ERROR_AGE
  }
}

export default builder.getInterface();
