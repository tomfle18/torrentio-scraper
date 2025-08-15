builder.defineStreamHandler((args) => {
  if (!args.id.match(/tt\d+/i) && !args.id.match(/kitsu:\d+/i)) {
    return Promise.resolve({ streams: [] });
  }

  // Zmiana: Użycie dmm.js do pobierania strumieni
  return requestQueue.wrap(args.id, () => dmm.getStreams(args.id, args.type))
      .then(streams => applyFilters(streams, args.extra))
      .then(streams => applySorting(streams, args.extra, args.type))
      .then(streams => applyStaticInfo(streams))
      .then(streams => applyMochs(streams, args.extra))
      .then(streams => enrichCacheParams(streams))
      .catch(error => {
        return Promise.reject(`Failed request ${args.id}: ${error}`);
      });
});
