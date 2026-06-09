import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

const RESULTS_BUCKET = "processing-results";

function validateSession(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  const result = verifySessionToken(token);
  return result.valid;
}

export async function GET(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("file");

  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "File name is required" }, { status: 400 });
  }

  // Prevent directory traversal
  if (!filename.endsWith(".json") || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.storage
      .from(RESULTS_BUCKET)
      .download(filename);

    if (error || !data) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    // Extract a cleaner name if it has the "---" format, otherwise use the filename
    let downloadName = filename;
    const parts = filename.split("---");
    if (parts.length === 4) {
      try {
        const decoded = decodeURIComponent(parts[2]);
        downloadName = `${decoded}.json`;
      } catch {
        downloadName = `${parts[2]}.json`;
      }
    }
    
    // Fallback URL-safe encoding for the Content-Disposition header
    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(downloadName)}"`);

    return new NextResponse(data, {
      status: 200,
      headers,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
