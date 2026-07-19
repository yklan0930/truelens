"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { upload } from "@vercel/blob/client";
import VideoResultCard from "./VideoResultCard";
import type { VideoResult } from "@/lib/video/types";

type Status = "idle" | "uploading" | "analyzing" | "done" | "failed";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const POLL_INTERVAL = 2500;

export default function VideoDetection() {
  const t = useT();
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [engine, setEngine] = useState<string>("");
  const [result, setResult] = useState<VideoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jobIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<Status>("idle");
  statusRef.current = status;

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const poll = useCallback(
    async (jobId: string) => {
      try {
        const res = await fetch(`/api/detect-video/status?jobId=${encodeURIComponent(jobId)}`);
        const data = await res.json();
        if (data.status === "done") {
          setResult(data.result as VideoResult);
          setStatus("done");
          stopPolling();
        } else if (data.status === "failed") {
          setError(data.error || t("video.errorGeneric"));
          setStatus("failed");
          stopPolling();
        }
      } catch {
        // network blip — keep polling
      }
    },
    [stopPolling, t]
  );

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      intervalRef.current = setInterval(() => poll(jobId), POLL_INTERVAL);
      poll(jobId);
    },
    [poll, stopPolling]
  );

  const reset = useCallback(() => {
    stopPolling();
    jobIdRef.current = null;
    setStatus("idle");
    setResult(null);
    setError(null);
    setFileName("");
    setFileSize(0);
    setEngine("");
  }, [stopPolling]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/")) {
        setError(t("video.errorNotVideo"));
        setStatus("failed");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(t("video.fileTooLarge"));
        setStatus("failed");
        return;
      }

      setError(null);
      setResult(null);
      setFileName(file.name);
      setFileSize(file.size);
      setStatus("uploading");

      try {
        // 1. Ask the server how to upload (Vercel Blob target, or mock mode).
        const prepareRes = await fetch(
          `/api/detect-video/prepare?name=${encodeURIComponent(file.name)}`
        );
        const prepare = await prepareRes.json();

        let blobUrl: string | null = null;
        if (prepare.configured) {
          const blob = await upload(prepare.pathname, file, {
            access: "public",
            handleUploadUrl: "/api/blob-upload",
          });
          blobUrl = blob.url;
        }

        // 2. Submit the detection job.
        const submitRes = await fetch("/api/detect-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobUrl,
            fileName: file.name,
            fileSize: file.size,
          }),
        });
        const submit = await submitRes.json();
        if (!submitRes.ok || !submit.success) {
          throw new Error(submit.error || t("video.errorSubmit"));
        }

        jobIdRef.current = submit.jobId;
        setEngine(submit.engine);
        setStatus("analyzing");
        startPolling(submit.jobId);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("video.errorGeneric"));
        setStatus("failed");
      }
    },
    [startPolling, t]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  // ---- UI ----
  if (status === "done" && result) {
    return (
      <div className="space-y-4">
        <VideoResultCard result={result} />
        <button
          onClick={reset}
          className="w-full text-slate-600 font-medium py-3 px-5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors min-h-[48px]"
        >
          🔄 {t("video.tryAnother")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all min-h-[200px] flex flex-col items-center justify-center ${
          dragOver
            ? "border-indigo-500 bg-indigo-50"
            : "border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={onInputChange}
        />
        <div className="text-4xl sm:text-5xl mb-4">🎬</div>
        <p className="text-lg font-medium text-slate-700 mb-1">{t("video.dropHint")}</p>
        <div className="flex flex-col sm:flex-row gap-3 mt-3">
          <button
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            <span>📁</span> {t("video.selectVideo")}
          </button>
          <button
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center gap-2 border border-slate-200"
            onClick={(e) => {
              e.stopPropagation();
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "video/*";
              input.capture = "environment";
              input.onchange = (ev) => {
                const f = (ev.target as HTMLInputElement).files?.[0];
                if (f) handleFile(f);
              };
              input.click();
            }}
          >
            <span>🎥</span> {t("video.takeVideo")}
          </button>
        </div>
        <p className="text-sm text-slate-400 mt-4">{t("video.supportedVideo")}</p>
        <p className="text-xs text-amber-500/90 mt-1 max-w-md">
          <span className="font-bold text-red-600">{t("video.longNote")}</span>
        </p>
      </div>

      {(status === "uploading" || status === "analyzing") && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <div>
              <p className="text-sm font-medium text-slate-700">
                {status === "uploading" ? t("video.statusUploading") : t("video.statusAnalyzing")}
              </p>
              {fileName && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {fileName} · {Math.round(fileSize / 1024 / 1024)} MB
                </p>
              )}
            </div>
          </div>
          {status === "analyzing" && (
            <p className="text-xs text-slate-400 mt-3">{t("video.analyzingNote")}</p>
          )}
        </div>
      )}

      {status === "failed" && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button
            onClick={reset}
            className="mt-3 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg min-h-[44px]"
          >
            {t("video.retry")}
          </button>
        </div>
      )}
    </div>
  );
}
