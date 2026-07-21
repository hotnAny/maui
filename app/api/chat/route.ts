import OpenAI from "openai";
import { chatRequestSchema } from "@/lib/schemas";
import type { StreamEvent } from "@/lib/domain";

export const runtime = "nodejs";

const encoder = new TextEncoder();

function encode(event: StreamEvent) {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

function safeProviderError(error: unknown) {
  if (error instanceof OpenAI.AuthenticationError) {
    return "The OpenAI API key is invalid. Replace OPENAI_API_KEY in .env.local and restart the server.";
  }
  if (error instanceof OpenAI.RateLimitError) {
    return "The OpenAI account has reached a rate or usage limit. Check its billing and limits, then try again.";
  }
  if (error instanceof OpenAI.PermissionDeniedError) {
    return "This OpenAI project does not have access to the configured model. Change OPENAI_MODEL or update project access.";
  }
  return "The assistant is unavailable right now. Check the server configuration and try again.";
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const parsed = chatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid chat request." }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await openai.responses.create({
          model: process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
          instructions:
            "You are the assistant inside maui, a minimal canvas-based chat app. Be clear and concise. Use Markdown when useful.",
          input: parsed.data.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          stream: true,
        });

        for await (const event of response) {
          if (event.type === "response.output_text.delta") {
            controller.enqueue(encode({ type: "text_delta", delta: event.delta }));
          }
          if (event.type === "error") {
            controller.enqueue(encode({ type: "error", message: "The model request failed." }));
          }
        }
        controller.enqueue(encode({ type: "complete" }));
      } catch (error) {
        console.error("OpenAI response failed", error);
        controller.enqueue(encode({ type: "error", message: safeProviderError(error) }));
      } finally {
        controller.close();
      }
    },
    cancel() {
      request.signal.throwIfAborted();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
