import { describe, expect, it } from "vitest";
import {
  extractImagePath,
  fileNameFor,
  looksLikeImageRequest,
  parseCommonsResponse,
  parseImageQueries,
} from "./image-search";

describe("looksLikeImageRequest", () => {
  it("detecta pedidos de buscar o descargar imágenes", () => {
    expect(looksLikeImageRequest("descargame una imagen de un perro")).toBe(true);
    expect(looksLikeImageRequest("busca fotos de un volcán")).toBe(true);
    expect(looksLikeImageRequest("dame una foto de un gato")).toBe(true);
    expect(looksLikeImageRequest("que le ponga fotos de internet")).toBe(true);
  });

  it("no captura pedidos de código, páginas o apps", () => {
    expect(looksLikeImageRequest("hacé una página web con fotos de internet")).toBe(false);
    expect(looksLikeImageRequest("agregá una imagen al componente de login")).toBe(false);
  });

  it("no captura charlas sin pedido de imagen", () => {
    expect(looksLikeImageRequest("qué hora es")).toBe(false);
    expect(looksLikeImageRequest("explicame qué es una imagen vectorial")).toBe(false);
  });
});

describe("extractImagePath", () => {
  it("toma la ruta de imagen mencionada", () => {
    expect(extractImagePath("bajala y guardala en public/img/perro.jpg")).toBe(
      "public/img/perro.jpg",
    );
  });
  it("devuelve null sin ruta de imagen", () => {
    expect(extractImagePath("bajá un perro")).toBeNull();
  });
  it("rechaza rutas que salen del proyecto", () => {
    expect(extractImagePath("guardala en ../secreto.png")).toBeNull();
  });
});

describe("parseImageQueries", () => {
  it("lee el JSON que devuelve el modelo", () => {
    const reply = '{"queries": ["dog", "perro"], "path": "public/perro.jpg"}';
    expect(parseImageQueries(reply, "x")).toEqual({
      queries: ["dog", "perro"],
      path: "public/perro.jpg",
    });
  });

  it("usa el texto original si la respuesta no es JSON válido", () => {
    const parsed = parseImageQueries("no sé", "descargame una imagen de un perro");
    expect(parsed.queries).toEqual(["perro"]);
    expect(parsed.path).toBeNull();
  });

  it("descarta rutas inválidas y consultas vacías", () => {
    const reply = '{"queries": ["x", "volcán"], "path": "/etc/passwd"}';
    expect(parseImageQueries(reply, "")).toEqual({ queries: ["volcán"], path: null });
  });
});

describe("parseCommonsResponse", () => {
  it("usa la miniatura para mostrar y el original para descargar", () => {
    const data = {
      query: {
        pages: {
          "1": {
            title: "File:Dog.jpg",
            imageinfo: [
              {
                url: "https://upload.example/Dog.jpg",
                thumburl: "https://upload.example/thumb/Dog.jpg",
                mime: "image/jpeg",
                width: 3000,
                height: 2000,
              },
            ],
          },
        },
      },
    };
    expect(parseCommonsResponse(data)).toEqual([
      {
        title: "Dog.jpg",
        thumb: "https://upload.example/thumb/Dog.jpg",
        full: "https://upload.example/Dog.jpg",
        width: 3000,
        height: 2000,
        source: "Wikimedia Commons",
      },
    ]);
  });

  it("ignora archivos que no son imágenes y repetidos", () => {
    const page = (title: string, url: string, mime: string) => ({
      title,
      imageinfo: [{ url, mime }],
    });
    const data = {
      query: {
        pages: {
          a: page("File:a.pdf", "https://x/a.pdf", "application/pdf"),
          b: page("File:b.png", "https://x/b.png", "image/png"),
          c: page("File:b2.png", "https://x/b.png", "image/png"),
        },
      },
    };
    expect(parseCommonsResponse(data).map((i) => i.full)).toEqual(["https://x/b.png"]);
  });

  it("tolera respuestas vacías", () => {
    expect(parseCommonsResponse({})).toEqual([]);
    expect(parseCommonsResponse(null)).toEqual([]);
  });
});

describe("fileNameFor", () => {
  it("arma un nombre seguro con extensión", () => {
    expect(fileNameFor({ title: "Dog photo (1).jpg", thumb: "", full: "", source: "" })).toBe(
      "Dog_photo_1_.jpg",
    );
    expect(fileNameFor({ title: "perro", thumb: "", full: "", source: "" })).toBe("perro.jpg");
  });
});

import {
  interleaveImages,
  parseFlickrResponse,
  parseOpenverseResponse,
  parsePexelsResponse,
  parsePixabayResponse,
  parseUnsplashResponse,
} from "./image-search";

describe("fuentes adicionales", () => {
  it("Openverse guarda autor y licencia", () => {
    const out = parseOpenverseResponse({
      results: [
        {
          title: "Perro",
          url: "https://img.example/perro.jpg",
          thumbnail: "https://img.example/perro-t.jpg",
          creator: "Ana",
          license: "by",
          license_version: "2.0",
          foreign_landing_url: "https://site.example/p",
        },
      ],
    });
    expect(out[0]).toMatchObject({
      source: "Openverse",
      creator: "Ana",
      license: "BY 2.0",
      thumb: "https://img.example/perro-t.jpg",
      full: "https://img.example/perro.jpg",
    });
  });

  it("Pexels usa la versión mediana para mostrar y la original para bajar", () => {
    const out = parsePexelsResponse({
      photos: [
        {
          alt: "Gato",
          src: { medium: "https://px/m.jpg", original: "https://px/o.jpg" },
          photographer: "Luis",
          url: "https://pexels.com/x",
        },
      ],
    });
    expect(out[0]).toMatchObject({
      source: "Pexels",
      thumb: "https://px/m.jpg",
      full: "https://px/o.jpg",
      creator: "Luis",
    });
  });

  it("Pixabay usa la versión web y la grande", () => {
    const out = parsePixabayResponse({
      hits: [
        {
          tags: "dog, pet",
          webformatURL: "https://pb/w.jpg",
          largeImageURL: "https://pb/l.jpg",
          user: "Sam",
          pageURL: "https://pb/p",
        },
      ],
    });
    expect(out[0]).toMatchObject({
      source: "Pixabay",
      thumb: "https://pb/w.jpg",
      full: "https://pb/l.jpg",
      creator: "Sam",
    });
  });

  it("Unsplash toma las URLs de urls y el autor de user", () => {
    const out = parseUnsplashResponse({
      results: [
        {
          alt_description: "Mar",
          urls: {
            small: "https://us/s.jpg",
            regular: "https://us/r.jpg",
            full: "https://us/f.jpg",
          },
          user: { name: "Eva" },
          links: { html: "https://unsplash.com/p" },
        },
      ],
    });
    expect(out[0]).toMatchObject({
      source: "Unsplash",
      thumb: "https://us/s.jpg",
      full: "https://us/f.jpg",
      creator: "Eva",
    });
  });

  it("Flickr arma la página de la foto y descarta las sin URL", () => {
    const out = parseFlickrResponse({
      photos: {
        photo: [
          {
            id: "1",
            owner: "99@N00",
            ownername: "Pat",
            title: "Río",
            url_m: "https://fl/m.jpg",
            url_o: "https://fl/o.jpg",
          },
          { id: "2", owner: "x", title: "sin url" },
        ],
      },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      source: "Flickr",
      creator: "Pat",
      pageUrl: "https://www.flickr.com/photos/99@N00/1",
    });
  });

  it("interleaveImages alterna fuentes sin repetir", () => {
    const img = (n: string) => ({ title: n, thumb: n, full: n, source: "s" });
    const merged = interleaveImages(
      [
        [img("a1"), img("a2")],
        [img("b1"), img("a1")],
      ],
      8,
    );
    expect(merged.map((i) => i.full)).toEqual(["a1", "b1", "a2"]);
  });
});
