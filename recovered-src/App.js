import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Play,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Film,
  Tv,
  Sparkles,
  ExternalLink,
  Server,
  Home as HomeIcon,
  Info,
} from 'lucide-react';
import '@/App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/* ---------- Shared components ---------- */

function Header() {
  return (
    <header
      data-testid="app-header"
      className="glass sticky top-0 z-40 border-b border-[var(--border)]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" data-testid="brand-link" className="flex items-center gap-3 group">
          <span className="w-9 h-9 rounded-lg grid place-items-center bg-[var(--accent)] text-black shadow-[0_6px_18px_-6px_var(--accent-glow)] transition-transform duration-200 group-hover:rotate-3">
            <Tv size={20} strokeWidth={2.5} />
          </span>
          <div className="leading-tight">
            <div className="font-display text-xl">EL ENCARGADO</div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--text-dim)]">
              PWA · Serie Completa
            </div>
          </div>
        </Link>
        <nav className="flex items-center gap-2">
          <Link to="/" className="btn-pill btn-ghost hidden sm:inline-flex" data-testid="nav-home">
            <HomeIcon size={14} /> Inicio
          </Link>
          <InstallButton />
        </nav>
      </div>
    </header>
  );
}

function InstallButton() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleInstall = async () => {
    if (!deferred) {
      alert(
        'Para instalar como App:\n• Chrome/Edge: menú ⋮ → "Instalar aplicación"\n• iOS Safari: Compartir → "Añadir a pantalla de inicio"'
      );
      return;
    }
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return (
    <button
      onClick={handleInstall}
      className="btn-pill btn-primary"
      data-testid="install-pwa-btn"
    >
      <Sparkles size={14} /> Instalar App
    </button>
  );
}

function Loader({ label = 'Cargando…' }) {
  return (
    <div className="min-h-[40vh] grid place-items-center" data-testid="loader">
      <div className="flex flex-col items-center gap-3">
        <div className="spinner" />
        <div className="text-sm text-[var(--text-mute)]">{label}</div>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="min-h-[40vh] grid place-items-center px-4" data-testid="error-state">
      <div className="glass rounded-2xl p-8 max-w-md text-center">
        <div className="text-[var(--secondary)] font-display text-2xl mb-2">Uy, un fallo</div>
        <p className="text-[var(--text-mute)] mb-4 text-sm">{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="btn-pill btn-ghost" data-testid="retry-btn">
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-[var(--border)] py-8 text-center">
      <div className="max-w-7xl mx-auto px-4 text-xs text-[var(--text-dim)] leading-relaxed">
        <p>
          Contenido obtenido dinámicamente desde fuentes públicas de terceros. Esta app no aloja
          videos. Uso personal / educativo.
        </p>
        <p className="mt-2 opacity-70">
          <Info size={12} className="inline mr-1" /> El Encargado — Guillermo Francella · Star+ ·
          2022–
        </p>
      </div>
    </footer>
  );
}

/* ---------- Home ---------- */

function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setError(null);
    setData(null);
    axios
      .get(`${API}/series`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.detail || e.message));
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Loader label="Cargando la serie…" />;

  const totalEpisodes = (data.seasons || []).reduce((_, __, i) => {
    // stable placeholder if backend didn't provide count
    return 0;
  }, 0);

  return (
    <div className="fade-in" data-testid="home-page">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10 bg-cover bg-center"
          style={{ backgroundImage: `url(${data.backdrop})` }}
          aria-hidden
        />
        <div className="absolute inset-0 -z-10 hero-scrim" aria-hidden />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-16 md:pt-24 md:pb-28 grid md:grid-cols-12 gap-10 items-end">
          <div className="md:col-span-8 lg:col-span-7">
            <div className="eyebrow mb-3">Serie · Argentina · {data.year || '2022'}</div>
            <h1
              className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[0.9] text-balance"
              data-testid="hero-title"
            >
              {data.title || 'El Encargado'}
            </h1>
            <p className="mt-5 max-w-2xl text-[var(--text-mute)] text-base sm:text-lg leading-relaxed">
              {data.overview}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              {(data.genres || ['Comedia', 'Drama']).map((g) => (
                <span
                  key={g}
                  className="px-3 py-1 rounded-full text-xs font-semibold border border-[var(--border)] text-[var(--text-mute)] uppercase tracking-widest"
                >
                  {g}
                </span>
              ))}
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[var(--accent)] text-black uppercase tracking-widest">
                HD 1080p
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold border border-[var(--border)] text-[var(--text-mute)] uppercase tracking-widest">
                {data.seasons?.length || 4} Temporadas
              </span>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/watch/1/1"
                className="btn-pill btn-primary"
                data-testid="hero-play-btn"
              >
                <Play size={16} fill="currentColor" /> Reproducir T1 · E1
              </Link>
              <a
                href="#temporadas"
                className="btn-pill btn-ghost"
                data-testid="hero-seasons-btn"
              >
                <Film size={16} /> Ver Temporadas
              </a>
            </div>

            {data.cast?.length > 0 && (
              <div className="mt-10">
                <div className="eyebrow mb-3">Elenco</div>
                <div className="cast-scroll">
                  {data.cast.map((actor) => (
                    <span key={actor} className="cast-chip" data-testid={`cast-${actor}`}>
                      {actor}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Poster */}
          <div className="md:col-span-4 lg:col-span-5 flex md:justify-end">
            <div
              className="relative w-[220px] sm:w-[260px] md:w-[300px] lg:w-[340px] rounded-2xl overflow-hidden border border-[var(--border)] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] card-hover"
              data-testid="hero-poster"
            >
              <img
                src={data.poster}
                alt={data.title}
                className="w-full h-full object-cover"
                loading="eager"
              />
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/85 to-transparent">
                <div className="eyebrow">Póster oficial</div>
                <div className="font-display text-2xl">{data.title}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Seasons */}
      <section
        id="temporadas"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20"
      >
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="eyebrow mb-2">Explorá</div>
            <h2 className="font-display text-3xl md:text-4xl">Todas las temporadas</h2>
          </div>
          <div className="text-xs text-[var(--text-dim)] hidden sm:block">
            Actualizado desde fuente en tiempo real
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 stagger">
          {(data.seasons || []).map((s) => (
            <Link
              key={s.number}
              to={`/season/${s.number}`}
              className="group card-hover glass rounded-2xl overflow-hidden"
              data-testid={`season-card-${s.number}`}
            >
              <div className="relative aspect-[2/3] bg-black overflow-hidden">
                <img
                  src={s.poster || data.poster}
                  alt={s.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4">
                  <div className="eyebrow">Temporada</div>
                  <div className="font-display text-4xl leading-none">{String(s.number).padStart(2, '0')}</div>
                </div>
              </div>
              <div className="p-4 flex items-center justify-between">
                <span className="text-sm text-[var(--text-mute)]">{s.title}</span>
                <ChevronRight size={16} className="text-[var(--accent)]" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------- Season page ---------- */

function SeasonPage() {
  const { season } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const s = parseInt(season, 10);

  const load = () => {
    setError(null);
    setData(null);
    axios
      .get(`${API}/series/season/${s}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.detail || e.message));
  };

  useEffect(() => {
    load();
  }, [s]);

  return (
    <div className="fade-in" data-testid={`season-page-${s}`}>
      <div
        className="relative overflow-hidden"
        style={data?.poster ? { minHeight: '30vh' } : undefined}
      >
        {data?.poster && (
          <>
            <div
              className="absolute inset-0 -z-10 bg-cover bg-center opacity-40"
              style={{ backgroundImage: `url(${data.poster})` }}
              aria-hidden
            />
            <div className="absolute inset-0 -z-10 hero-scrim" aria-hidden />
          </>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-mute)] hover:text-[var(--accent)] transition-colors duration-200"
            data-testid="back-home"
          >
            <ArrowLeft size={14} /> Volver
          </Link>
          <div className="eyebrow mt-6">El Encargado</div>
          <h1 className="font-display text-5xl md:text-6xl mt-1">
            Temporada <span className="text-[var(--accent)]">{s}</span>
          </h1>
          {data?.episodes && (
            <p className="text-[var(--text-mute)] mt-2 text-sm">
              {data.episodes.length} capítulos disponibles
            </p>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        {error && <ErrorState message={error} onRetry={load} />}
        {!data && !error && <Loader label={`Cargando Temporada ${s}…`} />}
        {data && (
          <div className="grid gap-3 stagger" data-testid="episodes-list">
            {data.episodes.map((ep) => (
              <EpisodeRow key={ep.number} season={s} ep={ep} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EpisodeRow({ season, ep }) {
  const nav = useNavigate();
  return (
    <button
      onClick={() => nav(`/watch/${season}/${ep.number}`)}
      className="group text-left glass rounded-xl p-4 md:p-5 flex items-center gap-4 md:gap-6 card-hover"
      data-testid={`episode-row-${season}-${ep.number}`}
    >
      <div className="font-display text-3xl md:text-5xl text-[var(--accent)] w-14 md:w-20 shrink-0 text-center">
        {String(ep.number).padStart(2, '0')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Temporada {season}
        </div>
        <div className="font-semibold text-base md:text-lg truncate">
          {ep.title || `Episodio ${ep.number}`}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="hidden md:inline-flex items-center gap-1 px-3 py-1 rounded-full border border-[var(--border)] text-xs text-[var(--text-mute)]">
          <Play size={12} /> Reproducir
        </span>
        <ChevronRight
          size={22}
          className="text-[var(--text-mute)] group-hover:text-[var(--accent)] transition-colors duration-200"
        />
      </div>
    </button>
  );
}

/* ---------- Watch page ---------- */

function WatchPage() {
  const { season, episode } = useParams();
  const nav = useNavigate();
  const s = parseInt(season, 10);
  const e = parseInt(episode, 10);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [seasonData, setSeasonData] = useState(null);

  useEffect(() => {
    setError(null);
    setData(null);
    setActiveIdx(0);
    axios
      .get(`${API}/series/episode/${s}/${e}`)
      .then((r) => setData(r.data))
      .catch((err) => setError(err?.response?.data?.detail || err.message));
    axios
      .get(`${API}/series/season/${s}`)
      .then((r) => setSeasonData(r.data))
      .catch(() => {});
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [s, e]);

  const nav_targets = useMemo(() => {
    if (!seasonData) return { prev: null, next: null };
    const nums = seasonData.episodes.map((x) => x.number).sort((a, b) => a - b);
    const idx = nums.indexOf(e);
    return {
      prev: idx > 0 ? { s, e: nums[idx - 1] } : null,
      next: idx >= 0 && idx < nums.length - 1 ? { s, e: nums[idx + 1] } : null,
    };
  }, [seasonData, s, e]);

  const activeServer = data?.servers?.[activeIdx];

  return (
    <div className="fade-in" data-testid={`watch-page-${s}-${e}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <Link
          to={`/season/${s}`}
          className="inline-flex items-center gap-2 text-sm text-[var(--text-mute)] hover:text-[var(--accent)] transition-colors duration-200"
          data-testid="back-season"
        >
          <ArrowLeft size={14} /> Temporada {s}
        </Link>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          {error && <ErrorState message={error} onRetry={() => window.location.reload()} />}
          {!data && !error && <Loader label={`Cargando episodio ${s}×${e}…`} />}

          {data && (
            <>
              <div className="player-frame" data-testid="video-player">
                {activeServer ? (
                  <iframe
                    key={activeServer.embed}
                    src={activeServer.embed}
                    allowFullScreen
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    referrerPolicy="no-referrer"
                    title={`Reproductor - ${activeServer.label}`}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-[var(--text-mute)]">
                    Sin servidor disponible.
                  </div>
                )}
              </div>

              {/* Server switcher */}
              {data.servers?.length > 0 && (
                <div className="mt-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Server size={14} className="text-[var(--accent)]" />
                    <span className="eyebrow">Servidores</span>
                  </div>
                  <div className="flex flex-wrap gap-2" data-testid="server-list">
                    {data.servers.map((srv, i) => (
                      <button
                        key={`${srv.embed}-${i}`}
                        onClick={() => setActiveIdx(i)}
                        className={`btn-pill ${i === activeIdx ? 'btn-primary' : 'btn-outline'}`}
                        data-testid={`server-btn-${i}`}
                      >
                        {srv.label}
                        <span className="text-[10px] opacity-70 uppercase tracking-widest">
                          {srv.language}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Prev/Next */}
              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  disabled={!nav_targets.prev}
                  onClick={() =>
                    nav_targets.prev &&
                    nav(`/watch/${nav_targets.prev.s}/${nav_targets.prev.e}`)
                  }
                  className="btn-pill btn-ghost disabled:opacity-30 disabled:cursor-not-allowed"
                  data-testid="prev-episode-btn"
                >
                  <ChevronLeft size={16} /> Anterior
                </button>
                <div className="text-xs text-[var(--text-dim)]">
                  Capítulo {e} · Temporada {s}
                </div>
                <button
                  disabled={!nav_targets.next}
                  onClick={() =>
                    nav_targets.next &&
                    nav(`/watch/${nav_targets.next.s}/${nav_targets.next.e}`)
                  }
                  className="btn-pill btn-ghost disabled:opacity-30 disabled:cursor-not-allowed"
                  data-testid="next-episode-btn"
                >
                  Siguiente <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Sidebar: episode info + download */}
        <aside className="lg:col-span-4 space-y-6">
          {data && (
            <>
              <div className="glass rounded-2xl p-6" data-testid="episode-info">
                <div className="eyebrow mb-1">
                  T{s} · E{e}
                </div>
                <h2 className="font-display text-3xl leading-tight">
                  {data.title || `Episodio ${e}`}
                </h2>
                {data.description && (
                  <p className="mt-3 text-sm text-[var(--text-mute)] leading-relaxed">
                    {data.description}
                  </p>
                )}
              </div>

              <div className="glass rounded-2xl p-6" data-testid="download-panel">
                <div className="flex items-center gap-2 mb-3">
                  <Download size={14} className="text-[var(--accent)]" />
                  <span className="eyebrow">Descargar / Guardar</span>
                </div>
                <p className="text-xs text-[var(--text-mute)] leading-relaxed mb-4">
                  Los reproductores externos incluyen la opción de descarga desde su propio menú.
                  Podés abrir cualquier servidor en pestaña nueva y usar el botón <b>Descargar</b>{' '}
                  del reproductor, o clic derecho → &ldquo;Guardar video como&hellip;&rdquo;.
                </p>
                <div className="grid gap-2">
                  {data.servers?.map((srv, i) => (
                    <a
                      key={`dl-${i}`}
                      href={srv.embed}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-pill btn-outline w-full justify-between"
                      data-testid={`download-link-${i}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Download size={14} /> {srv.label}
                      </span>
                      <ExternalLink size={12} />
                    </a>
                  ))}
                </div>
                {data.source_url && (
                  <a
                    href={data.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 block text-[11px] text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors duration-200 truncate"
                    data-testid="source-link"
                  >
                    Fuente original: {data.source_url}
                  </a>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ---------- Root ---------- */

function App() {
  return (
    <BrowserRouter>
      <div className="App grain">
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/season/:season" element={<SeasonPage />} />
          <Route path="/watch/:season/:episode" element={<WatchPage />} />
          <Route path="*" element={<Home />} />
        </Routes>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
