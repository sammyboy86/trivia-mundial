import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

// TODO(security): Consider implementing rate limiting on this endpoint

const RESULTS_BUCKET = "processing-results";

function validateSession(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  const result = verifySessionToken(token);
  return result.valid;
}

// GET — List all processing results
export async function GET(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from(RESULTS_BUCKET)
    .list("", {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error) {
    console.error("Failed to list processing results");
    return NextResponse.json(
      { error: "Failed to list results" },
      { status: 500 }
    );
  }

  const files = (data || [])
    .filter((f) => !f.name.startsWith("."))
    .map((f) => {
      let type = "extraction";
      let totalResults = "0";
      let customName = "Unnamed Result";
      
      const parts = f.name.split("---");
      if (parts.length === 4) {
        // format: type---totalResults---customName---uuid.json
        type = parts[0];
        totalResults = parts[1];
        try {
          customName = decodeURIComponent(parts[2]);
        } catch {
          customName = parts[2];
        }
      } else {
        // Fallback for older files or unexpected formats
        customName = f.metadata?.customName || "Unnamed Result";
        type = f.metadata?.type || "extraction";
        totalResults = f.metadata?.totalResults || "0";
      }

      return {
        id: f.id,
        storageName: f.name,
        size: f.metadata?.size || 0,
        sourceFiles: f.metadata?.sourceFiles || "",
        totalResults,
        customName,
        type,
        createdAt: f.created_at,
      };
    });

  return NextResponse.json({ files });
}

// DELETE — Remove a processing result
export async function DELETE(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("file");

    if (!filename || typeof filename !== "string") {
      return NextResponse.json(
        { error: "File name is required" },
        { status: 400 }
      );
    }

    if (!filename.endsWith(".json") || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
      return NextResponse.json(
        { error: "Invalid file identifier" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.storage
      .from(RESULTS_BUCKET)
      .remove([filename]);

    if (error) {
      console.error("Failed to delete processing result");
      return NextResponse.json(
        { error: "Failed to delete result" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
