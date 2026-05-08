# Stremio Letterboxd Watchlist Addon

A Stremio addon that fetches your public Letterboxd watchlist and exposes it as a browsable catalog.

## Requirements

- Node.js v14 or higher
- A Letterboxd account with a public watchlist
- A TMDB API key (free at themoviedb.org) — optional but strongly recommended for posters and metadata

## Setup

```bash
npm install
npm start
```

The server runs on `http://localhost:7000` by default. To install the addon in Stremio, paste the following URL into the search bar or the addon installer:

```
http://localhost:7000/manifest.json
```

**The server must keep running** for the addon to work. Stremio queries it on every catalog load. If the server is stopped, the catalog will appear empty. To avoid launching it manually every time, you can configure it as a systemd service on Linux, or deploy it to a VPS so it runs continuously without depending on your machine.

## Configuration

Open `index.js` and set your credentials at the top of the file:

```js
const LETTERBOXD_USERNAME = "username";
const TMDB_API_KEY = "tmdb_key";
```

## Architecture

```
stremio-letterboxd/
├── index.js           # Entry point: manifest definition and Stremio request handlers
├── src/
│   ├── letterboxd.js  # Scrapes the public watchlist HTML page by page
│   └── tmdb.js        # Enriches film data via the TMDB API
└── package.json
```

## How it works

Letterboxd does not provide a public API. The addon scrapes the HTML of your public watchlist (`letterboxd.com/{username}/watchlist/page/N/`) and parses film titles and slugs from the `data-item-name` and `data-item-slug` attributes of the rendered components.

Each film is then looked up on TMDB by title and year to retrieve its IMDb ID, which Stremio uses as the canonical identifier for linking to streams. TMDB also provides posters, French-language synopses, cast, runtime, and trailer links.

Pagination is handled via Stremio's `skip` parameter: a skip of 0 maps to page 1, skip 20 to page 2, and so on.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `7000`  | HTTP port   |
