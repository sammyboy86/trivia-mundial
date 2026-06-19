import { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { GoogleGenAI } from "@google/genai";

function validateSession(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  const result = verifySessionToken(token);
  return result.valid;
}

export async function POST(request: NextRequest) {
  if (!validateSession(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { questions, prompt } = body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return new Response(JSON.stringify({ error: "Questions array is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: object) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        const ai = new GoogleGenAI({ apiKey });

        const chunkSize = 5;
        const totalChunks = Math.ceil(questions.length / chunkSize);

        for (let i = 0; i < totalChunks; i++) {
          const chunk = questions.slice(i * chunkSize, (i + 1) * chunkSize);
          
          const chunkWithIds = chunk.map((q: any, idx: number) => ({ _t_id: idx, ...q }));

          sendEvent("progress", {
            current: i,
            total: totalChunks,
            heading: `Translating chunk ${i + 1} of ${totalChunks}...`,
            status: "translating",
          });

          const fullPrompt = `${prompt}\n\nCRITICAL: Keep the exact JSON structure identical. DO NOT change, remove, or omit the '_t_id' field. Return an array of objects.\n\nHere is the JSON array of questions to translate:\n\n${JSON.stringify(chunkWithIds, null, 2)}`;

          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: fullPrompt,
            config: {
              responseMimeType: "application/json",
            },
          });

          const responseText = response.text ?? "";
          let parsed: unknown;
          try {
            parsed = JSON.parse(responseText);
          } catch {
             sendEvent("error", { message: `Failed to parse translation for chunk ${i + 1}` });
             // Fallback to pushing the un-translated chunk so we don't lose data entirely
             parsed = chunk;
          }

          let finalChunk = new Array(chunk.length).fill(null);
          if (Array.isArray(parsed)) {
            parsed.forEach((q: any, idx: number) => {
              const pos = q._t_id !== undefined ? q._t_id : idx;
              if (pos >= 0 && pos < chunk.length) {
                finalChunk[pos] = q;
                delete finalChunk[pos]._t_id;
              }
            });
            for (let j = 0; j < chunk.length; j++) {
              if (!finalChunk[j]) finalChunk[j] = chunk[j];
            }
          } else {
            finalChunk = chunk;
          }

          sendEvent("chunk", {
            index: i,
            result: finalChunk,
          });
        }

        sendEvent("complete", { success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Translation failed";
        sendEvent("error", { message: msg });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
