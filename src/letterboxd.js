const https = require("https");

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject).on("timeout", function () { this.destroy(); reject(new Error("Timeout")); });
  });
}

async function fetchLetterboxdWatchlist(username, page = 1) {
  const url = `https://letterboxd.com/${username}/watchlist/page/${page}/`;
  console.log(`[Letterboxd] Scraping: ${url}`);

  const html = await fetchUrl(url);

  // Extract movies from data-item-name and data-item-slug
  const films = [];
  const regex = /data-item-name="([^"]+)"[^>]*data-item-slug="([^"]+)"/g;
  // And also in reverse order
  const regex2 = /data-item-slug="([^"]+)"[^>]*data-item-link="([^"]+)"/g;

  let match;

  // Main method : look for data-item-name
  const nameSlugRegex = /data-item-name="([^"]+)".*?data-item-slug="([^"]+)"/gs;
  while ((match = nameSlugRegex.exec(html)) !== null) {
    const fullName = match[1].replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
    const slug = match[2];

    // Extract year from title"
    const yearMatch = fullName.match(/\((\d{4})\)$/);
    const year = yearMatch ? parseInt(yearMatch[1]) : null;
    const title = fullName.replace(/\s*\(\d{4}\)$/, "").trim();

    if (title && slug && !films.find(f => f.slug === slug)) {
      films.push({ title, year, slug, poster: null, imdbId: null });
    }
  }

  console.log(`[Letterboxd] Page ${page}: ${films.length} movies found`);
  return films;
}

module.exports = { fetchLetterboxdWatchlist };