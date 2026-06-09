import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { GoogleGenAI } from "@google/genai";

// TODO(security): Consider implementing rate limiting on this endpoint
// TODO(security): Consider implementing CSRF tokens for this endpoint

const MD_BUCKET = "markdown-uploads";
const RESULTS_BUCKET = "processing-results";
const MAX_PROMPT_LENGTH = 10000;
const GEMINI_MODEL = "gemini-2.5-flash";

function validateSession(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  const result = verifySessionToken(token);
  return result.valid;
}

/**
 * Split markdown content by heading level.
 * Each chunk includes the heading as context + everything until the next same-or-higher-level heading.
 */
function chunkMarkdown(
  content: string,
  separator: string
): { heading: string; content: string }[] {
  // Build regex: match lines starting with exactly the separator level
  // e.g., "##" matches "## Heading" but not "### Sub"
  const level = separator.length; // 1, 2, or 3
  const regex = new RegExp(`^${"#".repeat(level)}(?!#)\\s+(.*)`, "gm");

  const matches: { index: number; heading: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    matches.push({ index: match.index, heading: match[1].trim() });
  }

  if (matches.length === 0) {
    // No headings found — treat entire content as one chunk
    return [{ heading: "(entire document)", content: content.trim() }];
  }

  const chunks: { heading: string; content: string }[] = [];

  // If there's content before the first heading, include it
  const preamble = content.slice(0, matches[0].index).trim();
  if (preamble) {
    chunks.push({ heading: "(preamble)", content: preamble });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const chunkContent = content.slice(start, end).trim();
    chunks.push({ heading: matches[i].heading, content: chunkContent });
  }

  return chunks;
}

/**
 * POST /api/admin/process
 *
 * Streams SSE events as each chunk is processed:
 *   event: progress   — { current, total, heading, status }
 *   event: chunk      — { index, heading, result }
 *   event: complete   — { resultFile, totalChunks, results }
 *   event: error      — { message }
 */
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

  let body: { files: string[]; separator: string; prompt: string; customName?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { files, separator, prompt, customName } = body;

  // Validate inputs
  if (!Array.isArray(files) || files.length === 0) {
    return new Response(JSON.stringify({ error: "No files selected" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!["#", "##", "###"].includes(separator)) {
    return new Response(JSON.stringify({ error: "Invalid separator" }), {
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

  const finalCustomName = customName && typeof customName === "string" ? customName.trim() : "Unnamed Extraction";

  // Validate all filenames are UUID.md format
  const uuidMdRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.md$/i;
  for (const file of files) {
    if (!uuidMdRegex.test(file)) {
      return new Response(
        JSON.stringify({ error: "Invalid file identifier" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // Set up SSE stream
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

        // Step 1: Download and chunk all files
        const allChunks: { heading: string; content: string; sourceFile: string }[] = [];

        for (const file of files) {
          const { data, error } = await supabaseAdmin.storage
            .from(MD_BUCKET)
            .download(file);

          if (error || !data) {
            sendEvent("error", {
              message: `Failed to download file: ${file}`,
            });
            controller.close();
            return;
          }

          const text = await data.text();
          const chunks = chunkMarkdown(text, separator);
          for (const chunk of chunks) {
            allChunks.push({ ...chunk, sourceFile: file });
          }
        }

        sendEvent("progress", {
          current: 0,
          total: allChunks.length,
          heading: "Starting...",
          status: "chunking_complete",
        });

        // Step 2: Process each chunk with Gemini
        const chunkResults: object[][] = new Array(allChunks.length);
        let completedCount = 0;
        const concurrencyLimit = 5;
        let currentIndex = 0;

        const worker = async () => {
          while (currentIndex < allChunks.length) {
            const i = currentIndex++;
            const chunk = allChunks[i];

            sendEvent("progress", {
              current: completedCount + 1,
              total: allChunks.length,
              heading: chunk.heading,
              status: "processing",
            });

            const fullPrompt = `${prompt}\n\n---\n\nHere is the content to process:\n\n${chunk.content}`;

            try {
              const response = await ai.models.generateContent({
                model: GEMINI_MODEL,
                contents: fullPrompt,
                config: {
                  responseMimeType: "application/json",
                },
              });

              const responseText = response.text ?? "";

              // Parse the JSON response
              let parsed: unknown;
              try {
                parsed = JSON.parse(responseText);
              } catch {
                // If Gemini returns non-JSON, wrap it
                parsed = { raw_response: responseText, parse_error: true };
              }

              // Save to specific index to preserve order
              if (Array.isArray(parsed)) {
                chunkResults[i] = parsed;
              } else {
                chunkResults[i] = [parsed as object];
              }

              sendEvent("chunk", {
                index: i,
                heading: chunk.heading,
                result: parsed,
              });
            } catch (err) {
              const errorMessage =
                err instanceof Error ? err.message : "Gemini API error";
              sendEvent("chunk", {
                index: i,
                heading: chunk.heading,
                result: { error: errorMessage },
              });
              chunkResults[i] = [{
                error: errorMessage,
                chunk_heading: chunk.heading,
              }];
            } finally {
              completedCount++;
              // Update progress with completed count
              sendEvent("progress", {
                current: completedCount,
                total: allChunks.length,
                heading: chunk.heading,
                status: "processing",
              });
            }
          }
        };

        // Start workers
        const workers = Array.from(
          { length: Math.min(concurrencyLimit, allChunks.length) },
          () => worker()
        );
        await Promise.all(workers);

        // Flatten the results preserving original order
        const results = chunkResults.flat();

        // Step 3: Save results to Supabase Storage
        const resultId = crypto.randomUUID();
        // Filename format: type---totalResults---customName---uuid.json
        const encodedName = encodeURIComponent(finalCustomName);
        const resultFilename = `extraction---${results.length}---${encodedName}---${resultId}.json`;
        
        const resultPayload = {
          metadata: {
            createdAt: new Date().toISOString(),
            sourceFiles: files,
            separator,
            promptUsed: prompt,
            customName: finalCustomName,
            type: "extraction",
            totalChunks: allChunks.length,
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
            totalChunks: allChunks.length,
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
