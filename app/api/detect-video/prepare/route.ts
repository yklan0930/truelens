import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/detect-video/prepare
// Returns what the browser needs to upload the video OUTSIDE Vercel functions
// (so we never hit the 4.5 MB body limit). Two modes:
//  - Blob configured (BLOB_READ_WRITE_TOKEN set): returns a unique `pathname`.
//    The client uploads directly to Vercel Blob via @vercel/blob/client `upload()`
//    using our /api/blob-upload route (which mints a short-lived client token
//    from the read-write token — the secret never reaches the browser).
//  - Not configured: returns { configured:false }. In mock mode the client
//    skips upload entirely; in sightengine mode this is a hard error (the
//    engine needs a public URL to fetch the video from).
export async function GET(request: NextRequest) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ configured: false });
  }
  const origName =
    (request.nextUrl.searchParams.get("name") || "video").replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `videos/${Date.now()}-${origName}`;
  return NextResponse.json({ configured: true, pathname });
}
