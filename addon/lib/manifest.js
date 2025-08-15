import { MochOptions } from '../moch/moch.js';
import { Providers } from './filter.js';
import { showDebridCatalog } from '../moch/options.js';
import { getManifestOverride } from './configuration.js';
import { Type } from './types.js';

const MochProviders = Object.values(MochOptions);

export function manifest(config = {}) {
  const overrideManifest = getManifestOverride(config);
  const baseManifest = {
    id: 'com.stremio.torrentio.addon',
    version: '0.0.15',
    name: getName(overrideManifest, config),
    description: getDescription(config),
    catalogs: getCatalogs(config),
    resources: getResources(config),
    types: [Type.MOVIE, Type.SERIES, Type.ANIME, Type.OTHER],
    background: `${config.host}/images/background_v1.jpg`,
    logo: `${config.host}/images/logo_v1.png`,
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    }
  };
  return Object.assign(baseManifest, overrideManifest);
}

export function dummyManifest() {
  const manifestDefault = manifest();
  manifestDefault.catalogs = [{ id: 'dummy', type: Type.OTHER }];
  manifestDefault.resources = ['stream', 'meta'];
  return manifestDefault;
}

function getName(manifest, config) {
  const rootName = manifest?.name || 'Torrentio';
  const mochSuffix = MochProviders
      .filter(moch => config[moch.key])
      .map(moch => moch.shortName)
      .join('/');
  return [rootName, mochSuffix].filter(v => v).join(' ');
}

// ZMIANA: Uproszczony opis
function getDescription(config) {
  const enabledMochs = MochProviders
      .filter(moch => config[moch.key])
      .map(moch => moch.name)
      .join(' & ');
  const possibleMochs = MochProviders.map(moch => moch.name).join('/');
  const mochsDesc = enabledMochs ? ` with ${enabledMochs} support` : '';
  return `Provides torrent streams from the Debrid Media Manager database. To configure Debrid providers (${possibleMochs}) and other settings, use the options below.`
}

function getCatalogs(config) {
  return MochProviders
      .filter(moch => showDebridCatalog(config) && config[moch.key])
      .map(moch => moch.catalogs.map(catalogName => ({
        id: catalogName ? `torrentio-${moch.key}-${catalogName.toLowerCase()}` : `torrentio-${moch.key}`,
        name: catalogName ? `${moch.name} ${catalogName}` : `${moch.name}`,
        type: 'other',
        extra: [{ name: 'skip' }],
      })))
      .reduce((a, b) => a.concat(b), []);
}

function getResources(config) {
  const streamResource = {
    name: 'stream',
    types: [Type.MOVIE, Type.SERIES, Type.ANIME],
    idPrefixes: ['tt', 'kitsu']
  };
  const metaResource = {
    name: 'meta',
    types: [Type.OTHER],
    idPrefixes: MochProviders.filter(moch => config[moch.key]).map(moch => moch.key)
  };
  if (showDebridCatalog(config) && MochProviders.filter(moch => config[moch.key]).length) {
    return [streamResource, metaResource];
  }
  return [streamResource];
}
