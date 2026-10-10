// Parallel OCR scanner.
//
// Runs alongside the existing jsQR loop: each scan component hands us the live
// <video> element, we center-crop it to a 3:1 strip, downscale to 120px wide,
// and ship the frame to the OCR worker. When a label matching the Stuffer ID
// format (e.g. 1234ABC-0001) is recognized, the caller receives it with an
// `id12:` prefix so it is treated exactly like a QR/NFC tag id.
//
// The worker is created lazily on the first frame and reused for the lifetime
// of the page, and at most one recognition is ever in flight so slow devices
// never build a backlog of stale frames.

const OCR_ID_PREFIX = "id12:";
const OCR_CODE_PATTERN = /\d{4}[A-Z]{3}-\d{4}/;
const OCR_STRIP_PATTERN = /[^A-Z0-9-]/g;
const OCR_TARGET_ASPECT = 3;
const OCR_TARGET_WIDTH = 120;
const OCR_MIN_INTERVAL_MS = 250;

type PendingCallback = (rawCode: string | null) => void;

let worker: Worker | null = null;
let workerStarted = false;
let workerReady = false;
let nextMessageId = 1;
let inFlight = false;
let lastScanAt = 0;
let scratchCanvas: HTMLCanvasElement | null = null;
const pending = new Map<number, PendingCallback>();

function ensureWorker(): void {
  if (workerStarted) return;
  workerStarted = true;

  try {
    worker = new Worker(new URL("../workers/ocr-worker.ts", import.meta.url), {
      type: "module",
    });
  } catch (error) {
    console.error("Failed to start the OCR worker:", error);
    worker = null;
    return;
  }

  worker.onmessage = (event: MessageEvent) => {
    const data = event.data;
    if (data?.type === "ready") {
      workerReady = true;
      return;
    }
    if (data?.type === "error") {
      console.error("OCR worker error:", data.message);
      return;
    }
    if (data?.type === "result") {
      inFlight = false;
      const callback = pending.get(data.id as number);
      if (!callback) return;
      pending.delete(data.id as number);
      console.log("OCR result:", data);
      if(data.confidence>0.93){
        callback(extractCode(data.items, data.text));
      }
    }
  };

  worker.onerror = (event) => {
    console.error("OCR worker crashed:", event.message);
    workerReady = false;
    inFlight = false;
    pending.clear();
  };

  // Public dir is served relative to the document base, so this resolves for
  // both the dev server and a sub-path deployment such as GitHub Pages.
  const wasmPaths = new URL("ort/", document.baseURI).href;
  worker.postMessage({ type: "init", wasmPaths });
}

function extractCode(items: unknown, text: unknown): string | null {
  const candidates = Array.isArray(items) ? [...items, text] : [text];

  for (const candidateRaw of candidates) {
    // Common OCR mixups
    const candidate = candidateRaw.replace("=","-").replace(" ","-").replace("_","-");
    if (typeof candidate !== "string") continue;
    const normalized = candidate.toUpperCase().replace(OCR_STRIP_PATTERN, "");
    const match = normalized.match(OCR_CODE_PATTERN);
    if (match) return match[0];
  }

  return null;
}

/**
 * Feed one video frame into the shared OCR pipeline.
 *
 * Safe to call every animation frame: calls are throttled and skipped while a
 * recognition is still running or while the worker is warming up. `onCode`
 * fires only when a valid Stuffer label is recognized.
 */
export function scanFrameForCode(
  video: HTMLVideoElement,
  onCode: (code: string) => void
): void {
  if (!workerStarted) ensureWorker();
  if (!worker || !workerReady || inFlight) return;

  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return;

  const now = performance.now();
  if (now - lastScanAt < OCR_MIN_INTERVAL_MS) return;

  // Crop top and bottom evenly until the frame is three times wider than tall.
  const cropHeight = Math.min(
    sourceHeight,
    Math.round(sourceWidth / OCR_TARGET_ASPECT)
  );
  const cropY = Math.max(0, Math.round((sourceHeight - cropHeight) / 2));
  const destWidth = OCR_TARGET_WIDTH;
  const destHeight = Math.max(1, Math.round((cropHeight / sourceWidth) * destWidth));

  if (!scratchCanvas) scratchCanvas = document.createElement("canvas");
  if (scratchCanvas.width !== destWidth) scratchCanvas.width = destWidth;
  if (scratchCanvas.height !== destHeight) scratchCanvas.height = destHeight;

  const ctx = scratchCanvas.getContext("2d");
  if (!ctx) return;

  ctx.drawImage(
    video,
    0,
    cropY,
    sourceWidth,
    cropHeight,
    0,
    0,
    destWidth,
    destHeight
  );

  const id = nextMessageId++;
  inFlight = true;
  lastScanAt = now;
  pending.set(id, (rawCode) => {
    if (rawCode) onCode(OCR_ID_PREFIX + rawCode);
  });

  createImageBitmap(scratchCanvas)
    .then((bitmap) => {
      worker?.postMessage({ type: "recognize", id, bitmap }, [bitmap]);
    })
    .catch((error) => {
      console.error("Failed to prepare an OCR frame:", error);
      pending.delete(id);
      inFlight = false;
    });
}
