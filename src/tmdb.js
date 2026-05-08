/**
 * tmdb.js
 * Enrichit les métadonnées des films via l'API TMDB.
 * Doc: https://developers.themoviedb.org/3
 */

const https = require("https");

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

/** Cache simple en mémoire pour éviter les appels répétés */
const cache = new Map();

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "StremioLetterboxdAddon/1.0" }, timeout: 10000 }, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`TMDB HTTP ${res.statusCode}`));
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error("JSON parse error"));
          }
        });
      })
      .on("error", reject)
      .on("timeout", function () {
        this.destroy();
        reject(new Error("TMDB timeout"));
      });
  });
}

/**
 * Recherche un film sur TMDB par titre (+ année optionnelle).
 * Retourne les données brutes TMDB ou null.
 */
async function searchTMDB(title, year, apiKey) {
  const cacheKey = `search:${title}:${year}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let url = `${TMDB_BASE}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(title)}&language=fr-FR&include_adult=false`;
  if (year) url += `&year=${year}`;

  try {
    const data = await fetchJson(url);
    const result = data.results?.[0] || null;
    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`[TMDB] Recherche échouée pour "${title}": ${err.message}`);
    return null;
  }
}

/**
 * Récupère les détails complets d'un film TMDB (dont external_ids pour IMDb).
 */
async function getTMDBDetails(tmdbId, apiKey) {
  const cacheKey = `details:${tmdbId}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const url = `${TMDB_BASE}/movie/${tmdbId}?api_key=${apiKey}&language=fr-FR&append_to_response=external_ids,credits,videos`;

  try {
    const data = await fetchJson(url);
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.warn(`[TMDB] Détails échoués pour tmdbId=${tmdbId}: ${err.message}`);
    return null;
  }
}

/**
 * Convertit les données TMDB en format meta Stremio.
 */
function tmdbToStremioMeta(details, imdbId) {
  if (!details) return null;

  const id = imdbId || details.external_ids?.imdb_id;
  if (!id || !id.startsWith("tt")) return null;

  // Genres
  const genres = details.genres?.map((g) => g.name) || [];

  // Cast
  const cast = details.credits?.cast?.slice(0, 5).map((c) => c.name) || [];

  // Director
  const directors =
    details.credits?.crew?.filter((c) => c.job === "Director").map((c) => c.name) || [];

  // Trailer YouTube
  const trailer = details.videos?.results?.find(
    (v) => v.site === "YouTube" && v.type === "Trailer"
  );

  const meta = {
    id,
    type: "movie",
    name: details.title,
    year: details.release_date ? parseInt(details.release_date.split("-")[0]) : undefined,
    poster: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : undefined,
    background: details.backdrop_path
      ? `https://image.tmdb.org/t/p/original${details.backdrop_path}`
      : undefined,
    description: details.overview || "",
    runtime: details.runtime ? `${details.runtime} min` : undefined,
    genres,
    cast,
    director: directors,
    imdbRating: details.vote_average ? details.vote_average.toFixed(1) : undefined,
    trailers: trailer
      ? [{ source: trailer.key, type: "Trailer" }]
      : [],
    links: [
      {
        name: "Letterboxd",
        category: "Reviews",
        url: `https://letterboxd.com/film/${details.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}/`,
      },
    ],
  };

  return meta;
}

/**
 * Enrichit une liste de films avec les données TMDB.
 * Retourne un tableau de metas Stremio.
 */
async function enrichWithTMDB(films, apiKey) {
  const results = [];

  for (const film of films) {
    try {
      // Si on a déjà un IMDb ID, utiliser getTMDBByImdb
      let details = null;
      let imdbId = film.imdbId;

      if (imdbId && imdbId.startsWith("tt")) {
        // Chercher par IMDb ID
        const url = `${TMDB_BASE}/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id&language=fr-FR`;
        const data = await fetchJson(url);
        const tmdbMovie = data.movie_results?.[0];
        if (tmdbMovie) {
          details = await getTMDBDetails(tmdbMovie.id, apiKey);
        }
      } else {
        // Chercher par titre
        const tmdbResult = await searchTMDB(film.title, film.year, apiKey);
        if (tmdbResult) {
          details = await getTMDBDetails(tmdbResult.id, apiKey);
          imdbId = details?.external_ids?.imdb_id;
        }
      }

      if (details && imdbId) {
        const meta = tmdbToStremioMeta(details, imdbId);
        if (meta) {
          results.push(meta);
          continue;
        }
      }

      // Fallback : meta minimal sans TMDB
      results.push({
        id: film.imdbId || `lb:${film.slug}`,
        type: "movie",
        name: film.title,
        year: film.year,
        poster: film.poster || null,
        description: film.description || "",
      });
    } catch (err) {
      console.warn(`[TMDB] Enrichissement échoué pour "${film.title}": ${err.message}`);
      results.push({
        id: film.imdbId || `lb:${film.slug}`,
        type: "movie",
        name: film.title,
        year: film.year,
        poster: film.poster || null,
      });
    }

    // Petit délai pour ne pas spammer l'API TMDB (40 req/10s max)
    await new Promise((r) => setTimeout(r, 50));
  }

  return results;
}

/**
 * Retourne la meta complète pour un film donné par IMDb ID.
 */
async function getMovieMeta(imdbId, apiKey) {
  try {
    const url = `${TMDB_BASE}/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id&language=fr-FR`;
    const data = await fetchJson(url);
    const tmdbMovie = data.movie_results?.[0];

    if (!tmdbMovie) return null;

    const details = await getTMDBDetails(tmdbMovie.id, apiKey);
    return tmdbToStremioMeta(details, imdbId);
  } catch (err) {
    console.error(`[TMDB] getMovieMeta échoué pour ${imdbId}: ${err.message}`);
    return null;
  }
}

module.exports = { enrichWithTMDB, getMovieMeta, searchTMDB };
