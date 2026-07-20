// Prototype endpoint: verify C2PA / Content Credentials on an uploaded image.
// Standalone so it can be demoed/tested independently of the main detect
// pipeline. Mirrors the multi-part handling of /api/detect.
import { NextRequest, NextResponse } from "next/server";
import { detectC2PA } from "@/lib/detectors/c2pa";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  let buffer: Buffer | null = null;
  let mimeType: string | undefined;

  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("image") as File | null;
      if (!file) {
        return NextResponse.json({ success: false, error: "missing image" }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ success: false, error: "file too large" }, { status: 413 });
      }
      const ab = await file.arrayBuffer();
      buffer = Buffer.from(ab);
      mimeType = file.type || undefined;
    } else {
      const body = await request.json();
      if (!body?.imageBase64) {
        return NextResponse.json({ success: false, error: "missing imageBase64" }, { status: 400 });
      }
      buffer = Buffer.from(body.imageBase64, "base64");
      mimeType = body.mimeType || undefined;
    }
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: String(e?.message || e) },
      { status: 400 }
    );
  }

  if (!buffer) {
    return NextResponse.json({ success: false, error: "no image" }, { status: 400 });
  }

  try {
    const c2pa = await detectC2PA(buffer, { mimeType });
    return NextResponse.json({ success: true, c2pa });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
