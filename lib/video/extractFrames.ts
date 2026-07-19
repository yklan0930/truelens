// Client-side frame extraction helper. Extracts N evenly-spaced frames from a
// video File and returns them as PNG Blobs ready to be POSTed to /api/detect.
//
// Uses HTMLCanvasElement + a hidden <video> element. No external deps. Works
// in any modern browser, including mobile Safari.

const FRAME_COUNT = 8; // 8 frames @ 1s intervals covers a 8s clip well

export interface ExtractedFrame {
  blob: Blob;
  index: number; // 0..N-1
  timestampSec: number; // approximate timestamp in source video
}

/**
 * Extract `count` evenly-spaced frames from the given video file.
 *
 * @throws if the browser can't decode the file as a video
 */
export async function extractFramesFromVideo(
  file: File,
  count: number = FRAME_COUNT,
  maxWidth: number = 768 // downscale — saves bandwidth, image model is robust to resize
): Promise<ExtractedFrame[]> {
  // 1. Decode metadata so we know duration.
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";

  const objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () =>
      reject(new Error("video.loadFailed"));
    // Safety: if metadata never loads, fail after 10s.
    setTimeout(() => reject(new Error("video.metadataTimeout")), 10_000);
  });

  const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  // If duration is 0 (some browsers, e.g. when not yet seekable), we fall back
  // to a simple 0..1s range. The 8 frames will still be useful for detection.
  const durationSafe = duration > 0.5 ? duration : 1;
  const timestamps = Array.from({ length: count }, (_, i) =>
    (durationSafe * (i + 0.5)) / count
  );

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("video.canvasUnavailable");

  const frames: ExtractedFrame[] = [];

  for (let i = 0; i < count; i++) {
    const t = timestamps[i];
    await seekVideo(video, t);
    // Wait one rAF so the frame is actually painted.
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
    );
    if (!blob) continue;
    frames.push({ blob, index: i, timestampSec: t });
  }

  URL.revokeObjectURL(objectUrl);
  return frames;
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("video.seekFailed"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    // Clamp to a slightly-shorter-than-duration value to avoid end-of-stream stalls.
    const target = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.05)));
    video.currentTime = target;
  });
}
