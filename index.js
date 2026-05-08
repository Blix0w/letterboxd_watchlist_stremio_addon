const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const { fetchLetterboxdWatchlist } = require("./src/letterboxd");
const { enrichWithTMDB, getMovieMeta } = require("./src/tmdb");
require('dotenv').config()
const PORT = process.env.PORT || 7000;

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const LETTERBOXD_USERNAME = process.env.LETTERBOXD_USERNAME;
const TMDB_API_KEY = process.env.TMDB_API_KEY; // https://www.themoviedb.org/settings/api
// ─────────────────────────────────────────────────────────────────────────────

const manifest = {
  id: "community.letterboxd-watchlist",
  version: "1.0.0",
  name: "Letterboxd Watchlist",
  description: `Watchlist Letterboxd de ${LETTERBOXD_USERNAME}`,
  logo: "https://a.ltrbxd.com/logos/letterboxd-mac-icon.png",
  catalogs: [
    {
      type: "movie",
      id: "letterboxd-watchlist",
      name: "🎬 Watchlist Letterboxd",
      extra: [{ name: "skip", isRequired: false }],
    },
  ],
  resources: ["catalog", "meta"],
  types: ["movie"],
  idPrefixes: ["tt"],
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  if (type !== "movie" || id !== "letterboxd-watchlist") return { metas: [] };

  const skip = parseInt(extra?.skip || "0", 10);
  const page = Math.floor(skip / 20) + 1;

  console.log(`[Catalog] Page ${page} pour "${LETTERBOXD_USERNAME}"`);

  try {
    const films = await fetchLetterboxdWatchlist(LETTERBOXD_USERNAME, page);
    if (!films?.length) return { metas: [] };

    const metas = TMDB_API_KEY
      ? await enrichWithTMDB(films, TMDB_API_KEY)
      : films.map((f) => ({
          id: f.imdbId || `lb:${f.slug}`,
          type: "movie",
          name: f.title,
          year: f.year,
          poster: f.poster || null,
        }));

    return { metas: metas.filter(Boolean) };
  } catch (err) {
    console.error("[Catalog] Erreur:", err.message);
    return { metas: [] };
  }
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== "movie" || !id.startsWith("tt") || !TMDB_API_KEY) return { meta: null };

  try {
    const meta = await getMovieMeta(id, TMDB_API_KEY);
    return { meta };
  } catch (err) {
    console.error("[Meta] Erreur:", err.message);
    return { meta: null };
  }
});

serveHTTP(builder.getInterface(), { port: PORT, static: "/public" });

console.log(`Addon started → http://localhost:${PORT}/manifest.json`);