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

        const chunkSize = 8;
        const totalChunks = Math.ceil(questions.length / chunkSize);
        const CONCURRENCY_LIMIT = 5;

        for (let i = 0; i < totalChunks; i += CONCURRENCY_LIMIT) {
          const batchPromises = [];

          for (let j = 0; j < CONCURRENCY_LIMIT && (i + j) < totalChunks; j++) {
            const chunkIndex = i + j;
            const chunk = questions.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize);
            
            sendEvent("progress", {
              current: chunkIndex,
              total: totalChunks,
              heading: `Processing chunk ${chunkIndex + 1} of ${totalChunks}...`,
              status: "processing",
            });

            const fullPrompt = `System Instructions:
You are a highly reliable JSON data processing engine. You MUST output ONLY valid JSON.
DO NOT wrap your response in markdown code blocks unless it is strictly valid JSON inside.
Your output must be a single JSON array of objects.
CRITICAL: You must return the EXACT same number of objects as the input array.
CRITICAL: Maintain any 'id' fields if passed to you.
CRITICAL: Do not invent missing questions.

User Prompt:
${prompt}

Input JSON array:
${JSON.stringify(chunk, null, 2)}`;

            batchPromises.push(
              ai.models.generateContent({
                model: "gemini-2.5-pro",
                contents: fullPrompt,
                config: {
                  responseMimeType: "application/json",
                },
              }).then(response => {
                const responseText = response.text ?? "";
                let parsed: unknown;
                try {
                  let cleanText = responseText.trim();
                  if (cleanText.startsWith("\`\`\`")) {
                     cleanText = cleanText.replace(/^\`\`\`(?:json)?\n?/, '').replace(/\n?\`\`\`$/, '');
                  }
                  parsed = JSON.parse(cleanText);
                } catch {
                   sendEvent("error", { message: `Failed to parse output for chunk ${chunkIndex + 1}. Raw text length: ${responseText.length}` });
                   parsed = chunk;
                }

                if (!Array.isArray(parsed)) {
                  if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).questions)) {
                    parsed = (parsed as any).questions;
                  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).generated_assessments)) {
                     parsed = (parsed as any).generated_assessments;
                  } else {
                     parsed = [parsed];
                  }
                }

                return { chunkIndex, result: parsed };
              }).catch(err => {
                sendEvent("error", { message: `Failed API call for chunk ${chunkIndex + 1}: ${err.message || "Unknown error"}` });
                return { chunkIndex, result: chunk };
              })
            );
          }

          const results = await Promise.all(batchPromises);

          for (const res of results) {
            sendEvent("chunk", {
              index: res.chunkIndex,
              result: res.result,
            });
          }
        }

        sendEvent("complete", { success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Processing failed";
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
