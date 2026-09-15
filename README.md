# El Encargado — sitio completo para GitHub + Vercel

Este proyecto une el front-end público recuperado con un backend FastAPI compatible. El bundle está configurado para consultar `/api` en el mismo dominio, por lo que no depende del preview original.

## Publicar en GitHub y Vercel

1. Creá un repositorio nuevo en GitHub.
2. Subí todo el contenido de esta carpeta a la raíz del repositorio.
3. En Vercel elegí **Add New Project** e importá ese repositorio.
4. Dejá el Root Directory en la raíz y no agregues build command.
5. Hacé deploy.

Vercel debería exponer `/`, `/api/series`, `/api/series/season/1`, `/api/series/episode/1/1` y `/health`.

## Personalizar contenido

Editá `catalog.json` con tus propios datos, imágenes y reproductores autorizados. El backend no descarga ni almacena videos.

## Prueba local

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Nota

Las imágenes y reproductores externos pueden estar sujetos a derechos de autor y condiciones de uso. Reemplazá las URLs de ejemplo por recursos que tengas autorización para utilizar.
