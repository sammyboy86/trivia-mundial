import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import crypto from "crypto";

// TODO(security): Consider implementing CSRF tokens for file upload endpoints
// TODO(security): Consider integrating malware scanning for uploaded files
// TODO(security): Consider implementing rate limiting on this endpoint

const BUCKET_NAME = "markdown-uploads";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = [".md", ".markdown"];

// Helper to validate admin session
function validateSession(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  const result = verifySessionToken(token);
  return result.valid;
}

// Validate file is markdown by checking extension and content
function validateMarkdownFile(
  filename: string,
  content: ArrayBuffer
): { valid: boolean; error?: string } {
  // Validate extension (allow-list)
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: "Only .md and .markdown files are allowed" };
  }

  // Validate size
  if (content.byteLength > MAX_FILE_SIZE) {
    return { valid: false, error: "File must be under 5MB" };
  }

  if (content.byteLength === 0) {
    return { valid: false, error: "File is empty" };
  }

  // Basic content validation — check it's valid UTF-8 text
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    decoder.decode(content);
  } catch {
    return { valid: false, error: "File does not contain valid text content" };
  }

  return { valid: true };
}

// GET — List all uploaded markdown files
export async function GET(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .list("", {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error) {
    console.error("Failed to list markdown files");
    return NextResponse.json(
      { error: "Failed to list files" },
      { status: 500 }
    );
  }

  // Map to include original filenames from metadata
  const files = (data || [])
    .filter((f) => !f.name.startsWith("."))
    .map((f) => ({
      id: f.id,
      storageName: f.name,
      originalName: f.metadata?.originalName || f.name,
      size: f.metadata?.size || 0,
      createdAt: f.created_at,
    }));

  return NextResponse.json({ files });
}

// POST — Upload a markdown file
export async function POST(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const content = await file.arrayBuffer();

    // Validate file
    const validation = validateMarkdownFile(file.name, content);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Generate unique filename to prevent path traversal and overwrites
    const uniqueId = crypto.randomUUID();
    const safeFilename = `${uniqueId}.md`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(safeFilename, content, {
        contentType: "text/markdown",
        upsert: false,
        metadata: {
          originalName: file.name.replace(/[^\w.\-_ ]/g, "_"),
          size: content.byteLength.toString(),
        },
      });

    if (uploadError) {
      console.error("Failed to upload markdown file");
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        file: {
          storageName: safeFilename,
          originalName: file.name.replace(/[^\w.\-_ ]/g, "_"),
          size: content.byteLength,
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}

// DELETE — Remove a markdown file
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

    // Validate filename format — must be UUID.md to prevent path traversal
    const uuidMdRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.md$/i;
    if (!uuidMdRegex.test(filename)) {
      return NextResponse.json(
        { error: "Invalid file identifier" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .remove([filename]);

    if (error) {
      console.error("Failed to delete markdown file");
      return NextResponse.json(
        { error: "Failed to delete file" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
