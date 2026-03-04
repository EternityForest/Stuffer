// Web Worker for handling background sync and updates
// This worker runs independently from the main UI thread

self.onmessage = (event: MessageEvent) => {
  const { type, data } = event.data;

  switch (type) {
    case 'sync':
      handleSync(data);
      break;
    case 'validate':
      handleValidation(data);
      break;
    default:
      console.warn('Unknown worker message type:', type);
  }
};

function handleSync(data: any) {
  // Handle sync operations
  console.log('Syncing:', data);
  // Send response back to main thread
  self.postMessage({
    type: 'sync-complete',
    data: { success: true },
  });
}

function handleValidation(data: any) {
  // Validate inventory contents match loadout
  const { contents, loadout } = data;

  const contentsSet = new Set(contents.map((c: any) => c.itemUUID));
  const loadoutSet = new Set(loadout.map((l: any) => l.itemUUID));

  const mismatch = {
    missing: Array.from(loadoutSet).filter(id => !contentsSet.has(id)),
    extra: Array.from(contentsSet).filter(id => !loadoutSet.has(id)),
  };

  self.postMessage({
    type: 'validation-complete',
    data: { mismatch, isValid: mismatch.missing.length === 0 && mismatch.extra.length === 0 },
  });
}
