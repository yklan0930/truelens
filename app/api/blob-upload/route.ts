import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/blob-upload
// Server-side token minting for Vercel Blob client uploads. The browser calls
// @vercel/blob/client `upload(pathname, file, { handleUploadUrl: "/api/blob-upload" })`,
// this route verifies the request and returns a short-lived client token + the
// real upload URL. The read-write token stays server-side.
export async function POST(request: NextRequest) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "blob_not_configured" }, { status: 503 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      token,
      request,
      body,
      // Restrict client uploads to video content types.
      onBeforeGenerateToken: async (_pathname, _clientPayload) => ({
        allowedContentTypes: [
          "video/mp4",
          "video/quicktime",
          "video/webm",
          "video/x-matroska",
          "video/x-msvideo",
        ],
      }),
      onUploadCompleted: async () => {
        // No post-upload server work needed; result is reported via the
        // Sightengine webhook once analysis finishes.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("[TrueLens Blob] handleUpload failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "upload_failed" },
      { status: 400 }
    );
  }
}
