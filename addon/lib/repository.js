import { Sequelize } from 'sequelize';
const Op = Sequelize.Op;

const DATABASE_URI = process.env.DATABASE_URI;

// ZMIANA: Sprawdzamy, czy DATABASE_URI istnieje, zanim połączymy się z bazą.
let database;
if (DATABASE_URI) {
  database = new Sequelize(DATABASE_URI, { logging: false, pool: { max: 30, min: 5, idle: 20 * 60 * 1000 } });
} else {
  console.warn('DATABASE_URI is not set. Database features will be disabled.');
}

const Torrent = database ? database.define('torrent',
    {
      infoHash: { type: Sequelize.STRING(64), primaryKey: true },
      provider: { type: Sequelize.STRING(32), allowNull: false },
      torrentId: { type: Sequelize.STRING(128) },
      title: { type: Sequelize.STRING(256), allowNull: false },
      size: { type: Sequelize.BIGINT },
      type: { type: Sequelize.STRING(16), allowNull: false },
      uploadDate: { type: Sequelize.DATE, allowNull: false },
      seeders: { type: Sequelize.SMALLINT },
      trackers: { type: Sequelize.STRING(4096) },
      languages: { type: Sequelize.STRING(4096) },
      resolution: { type: Sequelize.STRING(16) }
    }
) : null;

const File = database ? database.define('file',
    {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      infoHash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        references: { model: Torrent, key: 'infoHash' },
        onDelete: 'CASCADE'
      },
      fileIndex: { type: Sequelize.INTEGER },
      title: { type: Sequelize.STRING(256), allowNull: false },
      size: { type: Sequelize.BIGINT },
      imdbId: { type: Sequelize.STRING(32) },
      imdbSeason: { type: Sequelize.INTEGER },
      imdbEpisode: { type: Sequelize.INTEGER },
      kitsuId: { type: Sequelize.INTEGER },
      kitsuEpisode: { type: Sequelize.INTEGER }
    },
) : null;

// ZMIANA: Sprawdzamy, czy modele istnieją, zanim zdefiniujemy relacje.
if (Torrent && File) {
    Torrent.hasMany(File, { foreignKey: 'infoHash', constraints: false });
    File.belongsTo(Torrent, { foreignKey: 'infoHash', constraints: false });
}

// ZMIANA: Zwracamy puste obietnice, jeśli baza danych nie jest dostępna.
export function getTorrent(infoHash) {
  if (!Torrent) return Promise.resolve(null);
  return Torrent.findOne({ where: { infoHash: infoHash } });
}

export function getFiles(infoHashes) {
  if (!File) return Promise.resolve([]);
  return File.findAll({ where: { infoHash: { [Op.in]: infoHashes} } });
}

// Poniższe funkcje nie są używane w nowej logice, ale zostawiamy je puste,
// aby uniknąć błędów w innych częściach dodatku.
export function getImdbIdMovieEntries(imdbId) {
  return Promise.resolve([]);
}

export function getImdbIdSeriesEntries(imdbId, season, episode) {
  return Promise.resolve([]);
}

export function getKitsuIdMovieEntries(kitsuId) {
  return Promise.resolve([]);
}

export function getKitsuIdSeriesEntries(kitsuId, episode) {
  return Promise.resolve([]);
}
