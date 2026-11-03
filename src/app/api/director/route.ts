import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/director/system";
import { toolDefinitions } from "@/lib/director/tools";
import { directorRequest, parseJson } from "@/lib/server/validate";
import { anthropicClient, DIRECTOR_MODEL, DIRECTOR_EFFORT } from "@/lib/server/env";

export const maxDuration = 120;

// Thin streaming proxy around one Claude turn. The agent loop runs in the
// browser, where the project state lives: the client executes tool calls,
// appends tool results and calls this route again. The response is NDJSON:
//   {"t":"text","d":"..."}         text delta for the chat bubble
//   {"t":"tool","name":"..."}      a tool call started (for the activity line)
//   {"t":"done","message":{...}}   the final assistant message (content, stop_reason, usage)
//   {"t":"error","message":"..."}

const tools = toolDefinitions();
const lastTool = tools.length - 1;

export async function POST(req: Request) {
  const client = anthropicClient(req.headers.get("x-anthropic-key"));
  if (!client)
    return Response.json({ error: "No Anthropic API key configured" }, { status: 401 });

  const parsed = await parseJson(req, directorRequest, 4_000_000);
  if (parsed.error) return parsed.error;
  const messages = parsed.data.messages as Anthropic.Beta.BetaMessageParam[];

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const stream = client.beta.messages.stream({
          model: DIRECTOR_MODEL,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: DIRECTOR_EFFORT },
          // Static system prompt + tool list form a stable, cacheable prefix.
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          tools: tools.map((t, i) =>
            i === lastTool ? { ...t, cache_control: { type: "ephemeral" as const } } : t,
          ),
          messages,
        });
        stream.on("text", (d) => send({ t: "text", d }));
        stream.on("streamEvent", (e) => {
          if (e.type === "content_block_start" && e.content_block.type === "tool_use")
            send({ t: "tool", name: e.content_block.name });
        });
        const message = await stream.finalMessage();
        send({
          t: "done",
          message: {
            content: message.content,
            stop_reason: message.stop_reason,
            usage: message.usage,
            model: message.model,
          },
        });
      } catch (err) {
        const msg =
          err instanceof Anthropic.AuthenticationError
            ? "Anthropic rejected the API key."
            : err instanceof Anthropic.RateLimitError
              ? "Rate limited by Anthropic. Wait a moment and try again."
              : err instanceof Anthropic.APIError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : String(err);
        send({ t: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
