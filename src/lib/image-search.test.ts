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
