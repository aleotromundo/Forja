import { createFileRoute } from "@tanstack/react-router";
import {
  executeForja,
  InputSchema,
  type AiInput,
  type AiProgress,
  type AiResult,
} from "@/lib/ai.functions";

export const Route = createFileRoute("/api/ai-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let data: AiInput;
        try {
          data = InputSchema.parse(await request.json());
        } catch (error) {
          const message = error instanceof Error ? error.message : "La solicitud no es válida.";
          return Response.json({ error: message }, { status: 400 });
        }

        const encoder = new TextEncoder();
        let cancelled = false;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const send = (
              event:
                | AiProgress
                | { type: "result"; result: AiResult }
                | { type: "error"; message: string },
            ) => {
              if (cancelled || request.signal.aborted) return;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            };
            void executeForja(data, send, request.signal)
              .then((result) => {
                send({ type: "result", result });
                if (!cancelled) controller.close();
              })
              .catch((error: unknown) => {
                send({
                  type: "error",
                  message:
                    error instanceof Error
                      ? error.message
                      : "No se pudo completar la respuesta.",
                });
                if (!cancelled) controller.close();
              });
          },
          cancel() {
            cancelled = true;
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
