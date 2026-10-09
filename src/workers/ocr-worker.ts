// Dedicated worker running PaddleOCR (PP-OCRv6 tiny) off the main thread.
//
// The UI thread only feeds it a small, pre-cropped bitmap (120px wide, 3:1)
// and receives back the recognized text, so a slow mobile CPU never blocks
// the camera preview or the parallel QR scanner.

import * as ort from "onnxruntime-web";

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
}

const scope = self as unknown as WorkerScope;

type PaddleService = import("ppu-paddle-ocr/web").PaddleOcrService;

let service: PaddleService | null = null;
let initPromise: Promise<void> | null = null;

async function initialize(wasmPaths: string): Promise<void> {
  // Point ONNX Runtime at the self-hosted wasm assets *before* importing the
  // PaddleOCR web entry, whose module init otherwise rewrites this to a CDN.
  ort.env.wasm.wasmPaths = wasmPaths;
  // A single thread avoids the SharedArrayBuffer / cross-origin-isolation
  // requirement and keeps memory low on mobile.
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = "error";

  const { PaddleOcrService, V6_TINY_MODEL } = await import("ppu-paddle-ocr/web");
  const { loadOcrModel } = await import("../services/ocr-model-cache.js");

  scope.postMessage({ type: "progress", stage: "models" });

  const [detection, recognition, charactersDictionary] = await Promise.all([
    loadOcrModel("ppu-ocr-v6-tiny-det", V6_TINY_MODEL.detection),
    loadOcrModel("ppu-ocr-v6-tiny-rec", V6_TINY_MODEL.recognition),
    loadOcrModel("ppu-ocr-v6-tiny-dict", V6_TINY_MODEL.charactersDictionary),
  ]);

  scope.postMessage({ type: "progress", stage: "init" });

  const instance = new PaddleOcrService({
    model: { detection, recognition, charactersDictionary },
    session: {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    },
    debugging: { verbose: false, debug: false },
  });

  await instance.initialize();
  service = instance;
}

async function handleRecognize(id: number, bitmap: ImageBitmap): Promise<void> {
  try {
    if (!service) throw new Error("OCR service is not initialized");

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not acquire a 2D context");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // "cross-line" packs detected lines into batched inferences: the fastest
    // mode, which matters most on the mobile devices this targets.
    const result = await service.recognize(canvas, {
      flatten: true,
      strategy: "cross-line",
    });

    scope.postMessage({
      type: "result",
      id,
      text: result.text,
      items: result.results.map((item) => item.text),
      confidence: result.confidence,
    });
  } catch (error) {
    try {
      bitmap.close();
    } catch {
      // bitmap may already be closed
    }
    scope.postMessage({
      type: "result",
      id,
      text: "",
      items: [],
      confidence: 0,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

scope.onmessage = (event: MessageEvent) => {
  const data = event.data;
  switch (data?.type) {
    case "init":
      if (!initPromise) {
        initPromise = initialize(data.wasmPaths as string)
          .then(() => scope.postMessage({ type: "ready" }))
          .catch((error) => {
            console.error("OCR worker initialization failed:", error);
            scope.postMessage({
              type: "error",
              message: error instanceof Error ? error.message : String(error),
            });
          });
      }
      break;
    case "recognize":
      void handleRecognize(data.id as number, data.bitmap as ImageBitmap);
      break;
    default:
      break;
  }
};
