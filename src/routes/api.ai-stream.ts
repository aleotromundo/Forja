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
        let heartbeat: ReturnType<typeof setInterval> | undefined;
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
            heartbeat = setInterval(() => {
              if (!cancelled && !request.signal.aborted)
                controller.enqueue(encoder.encode(": keepalive\n\n"));
            }, 15_000);
            void executeForja(data, send, request.signal)
              .then((result) => {
                send({ type: "result", result });
                if (!cancelled && !request.signal.aborted) controller.close();
              })
              .catch((error: unknown) => {
                send({
                  type: "error",
                  message:
                    error instanceof Error
                      ? error.message
                      : "No se pudo completar la respuesta.",
                });
                if (!cancelled && !request.signal.aborted) controller.close();
              })
              .finally(() => {
                if (heartbeat) clearInterval(heartbeat);
              });
          },
          cancel() {
            cancelled = true;
            if (heartbeat) clearInterval(heartbeat);
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
