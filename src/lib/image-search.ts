// Búsqueda de imágenes públicas para el chat. Lógica pura (testeable) y descarga en el navegador.

export interface FoundImage {
  title: string;
  thumb: string;
  full: string;
  width?: number | undefined;
  height?: number | undefined;
  source: string;
  /** Autor de la imagen, para atribuirla. */
  creator?: string | undefined;
  /** Licencia, como texto corto (por ejemplo «CC BY 2.0»). */
  license?: string | undefined;
  /** Página de la imagen en su sitio de origen. */
  pageUrl?: string | undefined;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif)$/i;

// Pedidos de imágenes: menciona imagen/foto y pide buscarla, bajarla, mostrarla o ponerla.
const IMAGE_NOUN = /\b(imagen(?:es)?|fotos?|fotograf[ií]as?|pictures?|images?)\b/i;
const IMAGE_VERB =
  /\b(descarg\w*|baj\w*|busc\w*|dame|mostr\w*|tra[eé]\w*|consegu\w*|pon\w*|quiero|necesito|guard\w*|agreg\w*|download\w*|find|show|get)\b/i;
const INTERNET_HINT = /\b(internet|online|en la web|de la web)\b/i;
// Si pide código, una página o una app, el pedido lo sigue resolviendo el agente.
const BUILD_REQUEST =
  /\b(p[aá]gina|sitio|html|c[oó]digo|componente|aplicaci[oó]n|app|landing|web\s?site)\b/i;

export function looksLikeImageRequest(text: string): boolean {
  if (!IMAGE_NOUN.test(text)) return false;
  if (BUILD_REQUEST.test(text)) return false;
  return IMAGE_VERB.test(text) || INTERNET_HINT.test(text);
}

/** Ruta de destino mencionada en el texto, si termina en una extensión de imagen. */
export function extractImagePath(text: string): string | null {
  const match = text.match(/([\w\-./]+\.(?:jpe?g|png|webp|gif))\b/i);
  if (!match) return null;
  return cleanPath(match[1]!);
}

function cleanPath(raw: string): string | null {
  const path = raw.trim().replace(/^\.?\//, "");
  if (!path || path.startsWith("/") || path.split("/").some((p) => p === "..")) return null;
  return IMAGE_EXT.test(path) ? path : null;
}

/** Interpreta la respuesta del modelo: {"queries": [...], "path": "..." | null}. */
const FILLER = new Set([
  "un",
  "una",
  "uno",
  "unos",
  "unas",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "lo",
  "en",
  "y",
  "o",
  "con",
  "para",
  "por",
  "que",
  "me",
  "te",
  "le",
  "se",
  "al",
  "a",
  "mi",
  "tu",
  "algo",
  "sobre",
  "favor",
  "porfa",
  "por favor",
  "unas",
  "esa",
  "ese",
  "esta",
  "este",
]);

export function parseImageQueries(
  reply: string,
  fallbackText: string,
): { queries: string[]; path: string | null } {
  let queries: string[] = [];
  let path: string | null = null;
  const json = reply.match(/\{[\s\S]*\}/);
  if (json) {
    try {
      const data = JSON.parse(json[0]) as { queries?: unknown; path?: unknown };
      if (Array.isArray(data.queries)) {
        queries = data.queries
          .filter((q): q is string => typeof q === "string")
          .map((q) => q.trim())
          .filter((q) => q.length >= 2 && q.length <= 80);
      }
      if (typeof data.path === "string") path = cleanPath(data.path);
    } catch {
      /* respuesta mal formada: usamos el respaldo */
    }
  }
  if (queries.length === 0) {
    const plain = fallbackText
      .replace(IMAGE_NOUN, " ")
      .replace(IMAGE_VERB, " ")
      .split(/\s+/)
      .filter((w) => w && !FILLER.has(w.toLowerCase()))
      .join(" ")
      .slice(0, 80);
    if (plain.length >= 2) queries = [plain];
  }
  return { queries: [...new Set(queries)].slice(0, 3), path };
}

/** Convierte la respuesta de la API de Wikimedia Commons en imágenes utilizables. */
export function parseCommonsResponse(data: unknown, limit = 4): FoundImage[] {
  const pages = Object.values(
    (data as { query?: { pages?: Record<string, unknown> } })?.query?.pages ?? {},
  ) as {
    title?: string;
    imageinfo?: {
      url?: string;
      thumburl?: string;
      mime?: string;
      width?: number;
      height?: number;
    }[];
  }[];
  const seen = new Set<string>();
  const out: FoundImage[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info?.url || !info.mime || !IMAGE_MIME.test(info.mime)) continue;
    if (seen.has(info.url)) continue;
    seen.add(info.url);
    out.push({
      title: (page.title ?? "imagen").replace(/^File:/, ""),
      thumb: info.thumburl ?? info.url,
      full: info.url,
      width: info.width,
      height: info.height,
      source: "Wikimedia Commons",
    });
  }
  return out.slice(0, limit);
}

/** Nombre de archivo seguro a partir del título de la imagen. */
export function fileNameFor(image: FoundImage): string {
  const base = image.title.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "imagen";
  return IMAGE_EXT.test(base) ? base : `${base}.jpg`;
}

/** Descarga la imagen al equipo del usuario; si el navegador no puede, la abre en otra pestaña. */
export async function downloadImage(image: FoundImage): Promise<void> {
  try {
    const res = await fetch(image.full);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = fileNameFor(image);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    window.open(image.full, "_blank", "noopener");
  }
}

/** Instrucciones para convertir un pedido en consultas de búsqueda y una ruta opcional. */
export const IMAGE_QUERY_SYSTEM = `Extraé de la petición del usuario qué imagen buscar en un banco público de imágenes.
Respondé SOLO con JSON, sin texto alrededor, con esta forma:
{"queries": ["consulta en inglés", "consulta en el idioma del usuario"], "path": "ruta relativa de destino con extensión jpg, png, webp o gif, o null"}
- Las consultas son sustantivos concretos del tema pedido (por ejemplo "dog" o "volcano"). No incluyas palabras como imagen, foto, descargar, guardar, internet.
- "path" solo tiene valor si el usuario pidió guardarla en el proyecto; si no, null. Nunca uses rutas absolutas ni "..".
- Máximo 3 consultas.`;

// ---------- Fuentes gratuitas adicionales ----------

const isImageUrl = (url: unknown): url is string =>
  typeof url === "string" && /^https:\/\//.test(url);

/** Openverse: buscador de imágenes con licencias abiertas. */
export function parseOpenverseResponse(data: unknown, limit = 8): FoundImage[] {
  const results = (data as { results?: unknown[] })?.results ?? [];
  const out: FoundImage[] = [];
  for (const raw of results) {
    const r = raw as {
      title?: string;
      url?: string;
      thumbnail?: string;
      creator?: string;
      license?: string;
      license_version?: string;
      foreign_landing_url?: string;
      width?: number;
      height?: number;
    };
    if (!isImageUrl(r.url)) continue;
    out.push({
      title: r.title || "imagen",
      thumb: isImageUrl(r.thumbnail) ? r.thumbnail : r.url,
      full: r.url,
      width: r.width,
      height: r.height,
      source: "Openverse",
      creator: r.creator,
      license: r.license
        ? `${r.license.toUpperCase()}${r.license_version ? ` ${r.license_version}` : ""}`
        : undefined,
      pageUrl: r.foreign_landing_url,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Pexels: fotos gratuitas (requiere clave de API). */
export function parsePexelsResponse(data: unknown, limit = 8): FoundImage[] {
  const photos = (data as { photos?: unknown[] })?.photos ?? [];
  const out: FoundImage[] = [];
  for (const raw of photos) {
    const p = raw as {
      alt?: string;
      src?: { medium?: string; original?: string };
      photographer?: string;
      url?: string;
      width?: number;
      height?: number;
    };
    if (!isImageUrl(p.src?.original)) continue;
    out.push({
      title: p.alt || "foto",
      thumb: isImageUrl(p.src?.medium) ? p.src.medium : p.src.original,
      full: p.src.original,
      width: p.width,
      height: p.height,
      source: "Pexels",
      creator: p.photographer,
      license: "Licencia Pexels (gratis)",
      pageUrl: p.url,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Pixabay: imágenes gratuitas (requiere clave de API). */
export function parsePixabayResponse(data: unknown, limit = 8): FoundImage[] {
  const hits = (data as { hits?: unknown[] })?.hits ?? [];
  const out: FoundImage[] = [];
  for (const raw of hits) {
    const h = raw as {
      tags?: string;
      webformatURL?: string;
      largeImageURL?: string;
      user?: string;
      pageURL?: string;
      imageWidth?: number;
      imageHeight?: number;
    };
    if (!isImageUrl(h.largeImageURL)) continue;
    out.push({
      title: h.tags || "imagen",
      thumb: isImageUrl(h.webformatURL) ? h.webformatURL : h.largeImageURL,
      full: h.largeImageURL,
      width: h.imageWidth,
      height: h.imageHeight,
      source: "Pixabay",
      creator: h.user,
      license: "Licencia Pixabay (gratis)",
      pageUrl: h.pageURL,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Unsplash: fotos gratuitas (requiere clave de acceso). */
export function parseUnsplashResponse(data: unknown, limit = 8): FoundImage[] {
  const results = (data as { results?: unknown[] })?.results ?? [];
  const out: FoundImage[] = [];
  for (const raw of results) {
    const r = raw as {
      alt_description?: string;
      urls?: { small?: string; regular?: string; full?: string };
      user?: { name?: string };
      links?: { html?: string };
      width?: number;
      height?: number;
    };
    if (!isImageUrl(r.urls?.regular)) continue;
    out.push({
      title: r.alt_description || "foto",
      thumb: isImageUrl(r.urls?.small) ? r.urls.small : r.urls.regular,
      full: isImageUrl(r.urls?.full) ? r.urls.full : r.urls.regular,
      width: r.width,
      height: r.height,
      source: "Unsplash",
      creator: r.user?.name,
      license: "Licencia Unsplash (gratis)",
      pageUrl: r.links?.html,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Flickr: solo fotos con licencias Creative Commons (requiere clave de API). */
export function parseFlickrResponse(data: unknown, limit = 8): FoundImage[] {
  const photos = (data as { photos?: { photo?: unknown[] } })?.photos?.photo ?? [];
  const out: FoundImage[] = [];
  for (const raw of photos) {
    const p = raw as {
      id?: string;
      owner?: string;
      ownername?: string;
      title?: string;
      url_m?: string;
      url_o?: string;
      width_o?: string;
      height_o?: string;
    };
    const full = isImageUrl(p.url_o) ? p.url_o : isImageUrl(p.url_m) ? p.url_m : undefined;
    if (!full || !isImageUrl(p.url_m)) continue;
    out.push({
      title: p.title || "foto",
      thumb: p.url_m,
      full,
      width: p.width_o ? Number(p.width_o) : undefined,
      height: p.height_o ? Number(p.height_o) : undefined,
      source: "Flickr",
      creator: p.ownername,
      license: "Creative Commons (Flickr)",
      pageUrl: p.id && p.owner ? `https://www.flickr.com/photos/${p.owner}/${p.id}` : undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Combina resultados de varias fuentes alternando, sin repetir la misma imagen. */
export function interleaveImages(lists: FoundImage[][], limit = 8): FoundImage[] {
  const out: FoundImage[] = [];
  const seen = new Set<string>();
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max && out.length < limit; i++) {
    for (const list of lists) {
      const img = list[i];
      if (!img || seen.has(img.full)) continue;
      seen.add(img.full);
      out.push(img);
      if (out.length >= limit) break;
    }
  }
  return out;
}
