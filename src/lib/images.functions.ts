import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { type FoundImage, parseCommonsResponse } from "./image-search";

const USER_AGENT = "Forja/0.1 (imagenes para el chat)";

/** Busca imágenes públicas en Wikimedia Commons para cada consulta. Si una falla, sigue con las demás. */
export const searchImages = createServerFn({ method: "POST" })
  .validator(z.object({ queries: z.array(z.string().min(2).max(120)).min(1).max(3) }))
  .handler(async ({ data }): Promise<FoundImage[]> => {
    const found: FoundImage[] = [];
    const seen = new Set<string>();
    for (const query of data.queries) {
      const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
      endpoint.search = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: query,
        gsrnamespace: "6",
        gsrlimit: "8",
        prop: "imageinfo",
        iiprop: "url|mime|size",
        iiurlwidth: "800",
        format: "json",
        origin: "*",
      }).toString();
      try {
        const res = await fetch(endpoint, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) continue;
        for (const image of parseCommonsResponse(await res.json(), 8)) {
          if (seen.has(image.full)) continue;
          seen.add(image.full);
          found.push(image);
        }
      } catch {
        /* Una consulta fallida no corta el resto. */
      }
    }
    return found.slice(0, 4);
  });
