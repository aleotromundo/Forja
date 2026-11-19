import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  type FoundImage,
  interleaveImages,
  parseCommonsResponse,
  parseFlickrResponse,
  parseOpenverseResponse,
  parsePexelsResponse,
  parsePixabayResponse,
  parseUnsplashResponse,
} from "./image-search";

const USER_AGENT = "Forja/0.1 (imagenes para el chat)";
const TIMEOUT_MS = 8000;
const PER_SOURCE = 8;
const TOTAL = 8;

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Cada fuente devuelve imágenes para una consulta. Si una falla o no tiene clave, se omite. */
type Source = (query: string, env: Record<string, string | undefined>) => Promise<FoundImage[]>;

const SOURCES: Source[] = [
  // Wikimedia Commons: sin clave.
  async (q) => {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: q,
      gsrnamespace: "6",
      gsrlimit: String(PER_SOURCE),
      prop: "imageinfo",
      iiprop: "url|mime|size",
      iiurlwidth: "800",
      format: "json",
      origin: "*",
    }).toString();
    return parseCommonsResponse(await getJson(url.toString()), PER_SOURCE);
  },
  // Openverse: imágenes con licencias abiertas. Sin clave obligatoria.
  async (q) => {
    const url = new URL("https://api.openverse.org/v1/images/");
    url.search = new URLSearchParams({ q, page_size: String(PER_SOURCE) }).toString();
    return parseOpenverseResponse(await getJson(url.toString()), PER_SOURCE);
  },
  // Pexels: requiere PEXELS_API_KEY.
  async (q, env) => {
    if (!env["PEXELS_API_KEY"]) return [];
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${PER_SOURCE}`;
    return parsePexelsResponse(
      await getJson(url, { Authorization: env["PEXELS_API_KEY"] }),
      PER_SOURCE,
    );
  },
  // Pixabay: requiere PIXABAY_API_KEY.
  async (q, env) => {
    if (!env["PIXABAY_API_KEY"]) return [];
    const url = `https://pixabay.com/api/?key=${encodeURIComponent(env["PIXABAY_API_KEY"])}&q=${encodeURIComponent(q.slice(0, 100))}&image_type=photo&per_page=${PER_SOURCE}&safesearch=true`;
    return parsePixabayResponse(await getJson(url), PER_SOURCE);
  },
  // Unsplash: requiere UNSPLASH_ACCESS_KEY.
  async (q, env) => {
    if (!env["UNSPLASH_ACCESS_KEY"]) return [];
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=${PER_SOURCE}`;
    return parseUnsplashResponse(
      await getJson(url, { Authorization: `Client-ID ${env["UNSPLASH_ACCESS_KEY"]}` }),
      PER_SOURCE,
    );
  },
  // Flickr: solo licencias Creative Commons y dominio público. Requiere FLICKR_API_KEY.
  async (q, env) => {
    if (!env["FLICKR_API_KEY"]) return [];
    const url = new URL("https://api.flickr.com/services/rest/");
    url.search = new URLSearchParams({
      method: "flickr.photos.search",
      api_key: env["FLICKR_API_KEY"],
      text: q,
      license: "1,2,3,4,5,6,9,10",
      content_type: "1",
      media: "photos",
      sort: "relevance",
      per_page: String(PER_SOURCE),
      extras: "url_m,url_o,owner_name",
      format: "json",
      nojsoncallback: "1",
    }).toString();
    return parseFlickrResponse(await getJson(url.toString()), PER_SOURCE);
  },
];

/** Busca imágenes públicas en todas las fuentes disponibles, para cada consulta. */
export const searchImages = createServerFn({ method: "POST" })
  .validator(z.object({ queries: z.array(z.string().min(2).max(120)).min(1).max(3) }))
  .handler(async ({ data }): Promise<FoundImage[]> => {
    const env = process.env as Record<string, string | undefined>;
    const perQuery: FoundImage[][] = [];
    for (const query of data.queries) {
      const results = await Promise.all(
        SOURCES.map((source) => source(query, env).catch(() => [] as FoundImage[])),
      );
      perQuery.push(interleaveImages(results, PER_SOURCE));
    }
    return interleaveImages(perQuery, TOTAL);
  });
