import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";

const RESULTS_BUCKET = "processing-results";
const MAX_PROMPT_LENGTH = 10000;
const GEMINI_MODEL = "gemini-2.5-flash";

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
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: { files: string[]; prompt: string; customName?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { files, prompt, customName } = body;

  if (!Array.isArray(files) || files.length === 0) {
    return new Response(JSON.stringify({ error: "No files selected" }), {
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

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return new Response(
      JSON.stringify({
        error: `Prompt must be under ${MAX_PROMPT_LENGTH} characters`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const finalCustomName =
    customName && typeof customName === "string" ? customName.trim() : "Unnamed Process";

  // Validate filenames to prevent directory traversal
  for (const file of files) {
    if (!file.endsWith(".json") || file.includes("/") || file.includes("\\") || file.includes("..")) {
      return new Response(
        JSON.stringify({ error: "Invalid file identifier" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
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

        // Step 1: Download and collect all JSON items from the selected results
        const allItems: { content: object; sourceFile: string }[] = [];

        for (const file of files) {
          const { data, error } = await supabaseAdmin.storage
            .from(RESULTS_BUCKET)
            .download(file);

          if (error || !data) {
            sendEvent("error", {
              message: `Failed to download file: ${file}`,
            });
            controller.close();
            return;
          }

          const text = await data.text();
          let jsonFile: any;
          try {
            jsonFile = JSON.parse(text);
          } catch {
            sendEvent("error", {
              message: `Failed to parse file: ${file}`,
            });
            controller.close();
            return;
          }

          if (jsonFile && Array.isArray(jsonFile.results)) {
            for (const item of jsonFile.results) {
              allItems.push({ content: item, sourceFile: file });
            }
          }
        }

        if (allItems.length === 0) {
          sendEvent("error", {
            message: "No valid JSON items found in selected files.",
          });
          controller.close();
          return;
        }

        sendEvent("progress", {
          current: 0,
          total: allItems.length,
          heading: "JSON chunks loaded",
          status: "chunking_complete",
        });

        // Step 2: Process each JSON item with Gemini concurrently
        const chunkResults: object[][] = new Array(allItems.length);
        let completedCount = 0;
        const concurrencyLimit = 5;
        let currentIndex = 0;

        const worker = async () => {
          while (currentIndex < allItems.length) {
            const i = currentIndex++;
            const item = allItems[i];
            const itemStr = JSON.stringify(item.content, null, 2);
            
            // Generate a small heading preview for the UI
            let previewHeading = `Chunk ${i + 1}`;
            if (item.content && typeof item.content === "object" && "topic" in item.content) {
               previewHeading = String((item.content as any).topic).slice(0, 30);
            }

            sendEvent("progress", {
              current: completedCount + 1,
              total: allItems.length,
              heading: previewHeading,
              status: "processing",
            });

            const fullPrompt = `${prompt}\n\n---\n\nHere is the JSON object to process:\n\n${itemStr}`;

            try {
              const response = await ai.models.generateContent({
                model: GEMINI_MODEL,
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
                parsed = { raw_response: responseText, parse_error: true };
              }

              if (Array.isArray(parsed)) {
                chunkResults[i] = parsed;
              } else {
                chunkResults[i] = [parsed as object];
              }

              sendEvent("chunk", {
                index: i,
                heading: previewHeading,
                result: parsed,
              });
            } catch (err) {
              const errorMessage =
                err instanceof Error ? err.message : "Gemini API error";
              sendEvent("chunk", {
                index: i,
                heading: previewHeading,
                result: { error: errorMessage },
              });
              chunkResults[i] = [{
                error: errorMessage,
                source_chunk: previewHeading,
              }];
            } finally {
              completedCount++;
              sendEvent("progress", {
                current: completedCount,
                total: allItems.length,
                heading: previewHeading,
                status: "processing",
              });
            }
          }
        };

        const workers = Array.from(
          { length: Math.min(concurrencyLimit, allItems.length) },
          () => worker()
        );
        await Promise.all(workers);

        const results = chunkResults.flat();

        // Step 3: Save final processed results to Supabase Storage
        const resultId = crypto.randomUUID();
        const encodedName = encodeURIComponent(finalCustomName);
        const resultFilename = `processing---${results.length}---${encodedName}---${resultId}.json`;
        
        const resultPayload = {
          metadata: {
            createdAt: new Date().toISOString(),
            sourceFiles: files,
            promptUsed: prompt,
            customName: finalCustomName,
            type: "processing",
            totalChunks: allItems.length,
            totalResults: results.length,
          },
          results,
        };

        const jsonBuffer = new TextEncoder().encode(
          JSON.stringify(resultPayload, null, 2)
        );

        const { error: uploadError } = await supabaseAdmin.storage
          .from(RESULTS_BUCKET)
          .upload(resultFilename, jsonBuffer, {
            contentType: "application/json",
            upsert: false,
          });

        if (uploadError) {
          sendEvent("error", {
            message: "Failed to save results to storage",
          });
        } else {
          sendEvent("complete", {
            resultFile: resultFilename,
            totalChunks: allItems.length,
            totalResults: results.length,
          });
        }
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
