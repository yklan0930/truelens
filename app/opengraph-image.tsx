import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "TrueLens — AI Image Authenticity Detection";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "30px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://truelens.top/logo-icon.png"
            width={80}
            height={80}
            style={{ borderRadius: "20px" }}
            alt="TrueLens"
          />
          <div style={{ color: "white", fontSize: "44px", fontWeight: 700 }}>
            TrueLens
          </div>
        </div>
        <div
          style={{
            color: "white",
            fontSize: "36px",
            fontWeight: 600,
            textAlign: "center",
            maxWidth: "800px",
            lineHeight: 1.3,
          }}
        >
          AI Image Authenticity Detection
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: "22px",
            marginTop: "16px",
            textAlign: "center",
            maxWidth: "700px",
          }}
        >
          Upload an image. Know if it&apos;s real or AI-generated in seconds.
        </div>
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "40px",
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.15)",
              borderRadius: "12px",
              padding: "10px 20px",
              color: "white",
              fontSize: "18px",
            }}
          >
            Deep Learning
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.15)",
              borderRadius: "12px",
              padding: "10px 20px",
              color: "white",
              fontSize: "18px",
            }}
          >
            EXIF Analysis
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.15)",
              borderRadius: "12px",
              padding: "10px 20px",
              color: "white",
              fontSize: "18px",
            }}
          >
            Results in Seconds
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: "30px",
            color: "rgba(255,255,255,0.5)",
            fontSize: "18px",
          }}
        >
          truelens.top
        </div>
      </div>
    ),
    { ...size }
  );
}
