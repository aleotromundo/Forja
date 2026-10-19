import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Workbench } from "@/components/forja/Workbench";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Forja — Editor de código con IA" },
      { name: "description", content: "Editor tipo VS Code en el navegador: abrí carpetas locales y dejá que la IA modifique tu código." },
      { property: "og:title", content: "Forja — Editor de código con IA" },
      { property: "og:description", content: "Abrí tu proyecto local y editalo hablando con la IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly fallback={<div className="h-screen bg-background" />}>
      <Workbench />
    </ClientOnly>
  );
}
