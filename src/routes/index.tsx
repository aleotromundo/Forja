import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Workbench } from "@/components/forja/Workbench";
import { LandingPage } from "@/components/forja/LandingPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Forja — Editor de código con IA" },
      {
        name: "description",
        content:
          "Forja es tu espacio de desarrollo con IA: trabajá sobre tu proyecto local con control y herramientas reales.",
      },
      { property: "og:title", content: "Forja — Editor de código con IA" },
      {
        property: "og:description",
        content: "Descargá Forja para Windows y convertí tus ideas en software.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const desktop =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("desktop") === "1";
  return (
    <ClientOnly fallback={<div className="h-screen bg-background" />}>
      {desktop ? <Workbench /> : <LandingPage />}
    </ClientOnly>
  );
}
