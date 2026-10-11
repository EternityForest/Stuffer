// Flash (torch) preference and helpers for the QR scanners.
//
// The preference is intentionally kept only in memory: it survives
// navigation between the different scanning screens, but a full page load
// starts fresh.

interface TorchCapabilities {
  torch?: boolean;
}

interface TorchConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
}

let flashEnabled = false;

export function isFlashEnabled(): boolean {
  return flashEnabled;
}

export function setFlashEnabled(enabled: boolean): void {
  flashEnabled = enabled;
}

export function getVideoTrack(
  video: HTMLVideoElement | null
): MediaStreamTrack | null {
  const stream = video?.srcObject as MediaStream | null;
  if (!stream) {
    return null;
  }
  return stream.getVideoTracks()[0] ?? null;
}

export function trackSupportsTorch(track: MediaStreamTrack | null): boolean {
  if (!track || typeof track.getCapabilities !== "function") {
    return false;
  }
  const capabilities = track.getCapabilities() as unknown as TorchCapabilities;
  return capabilities.torch === true;
}

export async function applyTorch(
  track: MediaStreamTrack,
  enabled: boolean
): Promise<void> {
  const constraintSet: TorchConstraintSet = { torch: enabled };
  await track.applyConstraints({
    advanced: [constraintSet],
  } as MediaTrackConstraints);
}
