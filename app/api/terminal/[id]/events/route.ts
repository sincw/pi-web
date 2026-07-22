import { isTerminalId, subscribeTerminal, type TerminalEvent } from "@/lib/terminal-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

function encode(event: TerminalEvent) {
  return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isTerminalId(id)) return new Response("Invalid terminal id", { status: 400 });

  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const unsubscribe = subscribeTerminal(id, (event) => controller.enqueue(encode(event)));
      if (!unsubscribe) {
        controller.error(new Error("Terminal not found"));
        return;
      }
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(":\n\n")), 30_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // The stream can already be closed by the client.
        }
      };
      req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
