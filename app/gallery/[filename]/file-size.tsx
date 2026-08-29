"use client";

import { useEffect, useState } from "react";

function formatFileSize(bytes: number) {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  }

  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }

  if (bytes >= 1_000) {
    return `${(bytes / 1_000).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

export function FileSize({ url }: { url: string }) {
  const [fileSize, setFileSize] = useState("...");

  useEffect(() => {
    const controller = new AbortController();

    async function loadFileSize() {
      try {
        const response = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
        });
        const contentLength = Number(response.headers.get("content-length"));

        if (response.ok && Number.isFinite(contentLength) && contentLength > 0) {
          setFileSize(formatFileSize(contentLength));
        } else {
          setFileSize("Unknown");
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setFileSize("Unknown");
        }
      }
    }

    void loadFileSize();

    return () => controller.abort();
  }, [url]);

  return (
    <span
      aria-label={`File size ${fileSize}`}
      className="content-center border-l border-[#050505] px-[0.625rem] whitespace-nowrap"
    >
      {fileSize}
    </span>
  );
}