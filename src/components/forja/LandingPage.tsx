import { ArrowRight, Download, Github, ShieldCheck, Sparkles, Terminal } from "lucide-react";

const INSTALLER_URL =
  (import.meta.env["VITE_DESKTOP_INSTALLER_URL"] as string | undefined) ||
  "/downloads/Forja_0.1.0_x64-setup.exe";

export function LandingPage() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav">
        <a className="landing-brand" href="/" aria-label="Forja inicio">
          <span className="landing-mark">
            <Sparkles size={17} />
          </span>
          <span>FORJA</span>
        </a>
        <div className="landing-nav-links">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="https://github.com/aleotromundo/Forja" target="_blank" rel="noreferrer">
            Código abierto <Github size={14} />
          </a>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-eyebrow">
            <span /> DESARROLLO LOCAL · IA CON ACCESO REAL
          </p>
          <h1>
            Convertí tus ideas
            <br />
            <em>en software.</em>
          </h1>
          <p className="landing-lead">
            Forja es tu espacio de desarrollo con IA: abrí una carpeta, conversá con tu agente y
            construí directamente sobre tu proyecto.
          </p>
          <div className="landing-actions">
            <a className="landing-download" href={INSTALLER_URL} download>
              <Download size={19} />
              <span>
                <strong>Descargar Forja</strong>
                <small>Windows · instalador en español</small>
              </span>
              <ArrowRight size={18} />
            </a>
            <a className="landing-secondary" href="#version-web">
              Ver versión web <ArrowRight size={15} />
            </a>
          </div>
          <p className="landing-note">
            <ShieldCheck size={14} /> Tus archivos permanecen en tu computadora.
          </p>
        </div>

        <div className="landing-scene" aria-label="Vista abstracta del espacio de trabajo de Forja">
          <div className="scene-orbit scene-orbit-one" />
          <div className="scene-orbit scene-orbit-two" />
          <div className="scene-core">
            <span>F</span>
          </div>
          <div className="scene-card scene-card-top">
            <Terminal size={14} />
            <span>agente local</span>
            <b>activo</b>
          </div>
          <div className="scene-card scene-card-bottom">
            <span className="scene-dot" /> proyecto abierto <strong>100%</strong>
          </div>
        </div>
      </section>

      <section className="landing-features" id="como-funciona">
        <article>
          <span>01</span>
          <h2>Hablá con tu código</h2>
          <p>La IA entiende tu proyecto y actúa con herramientas verificables, no con promesas.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Trabajá localmente</h2>
          <p>Archivos, comandos y descargas ocurren en tu máquina, con permisos claros.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Construí con control</h2>
          <p>Revisá cambios, aprobá acciones y retomá tareas sin perder el contexto.</p>
        </article>
      </section>

      <section className="landing-web" id="version-web">
        <div>
          <p className="landing-eyebrow">
            <span /> TAMBIÉN EN TU NAVEGADOR
          </p>
          <h2>Probala sin instalar.</h2>
          <p>
            La versión web te permite explorar Forja desde cualquier navegador compatible. Para
            abrir carpetas, editar archivos y usar el agente local tendrás que autorizar el acceso;
            los comandos y las descargas requieren conectar el agente.
          </p>
        </div>
        <a className="landing-web-button" href="/?desktop=1">
          Abrir versión web <ArrowRight size={17} />
        </a>
      </section>

      <footer className="landing-footer">
        <span>FORJA · tu taller digital</span>
        <span>Open source · Windows · Español</span>
      </footer>
    </main>
  );
}
