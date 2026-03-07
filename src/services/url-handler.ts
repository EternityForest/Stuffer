/**
 * Handles URL protocol navigation for asset-id:// URIs
 * Asset IDs are opaque ULIDs, so we need to search across workspaces
 */

export interface URLNavigation {
  screen: string;
  context: {
    workspaceKey?: string;
    object?: string;
  };
}

export interface WorkspaceSearcher {
  findAssetInWorkspaces(assetId: string): Promise<{ workspaceKey: string; objectId: string } | null>;
}

let workspaceSearcher: WorkspaceSearcher | null = null;

/**
 * Register the workspace searcher for resolving asset IDs
 */
export function registerWorkspaceSearcher(searcher: WorkspaceSearcher) {
  workspaceSearcher = searcher;
}

/**
 * Parse asset ID URL - format is just the ULID since it's opaque
 */
export function parseAssetIdURL(url: string): string | null {
  try {
    // Handle different protocol variations and extract just the ULID
    const protocolMatch = url.match(/^(?:web\+)?assetid:\/\/(.+?)(?:\/|$)/i);
    if (!protocolMatch) {
      return null;
    }
    return protocolMatch[1];
  } catch (error) {
    console.error('Failed to parse asset-id URL:', error);
  }
  return null;
}

/**
 * Resolve asset ID to workspace + object by searching workspaces
 */
export async function resolveAssetIdURL(assetId: string): Promise<URLNavigation | null> {
  if (!workspaceSearcher) {
    console.warn('Workspace searcher not registered for asset ID resolution');
    return null;
  }

  if(!assetId.startsWith('asset-id://')) {
    assetId = 'asset-id://' + assetId;
  }

  try {
    const result = await workspaceSearcher.findAssetInWorkspaces(assetId);
    if (result) {
      return {
        screen: 'object-inspect',
        context: {
          workspaceKey: result.workspaceKey,
          object: result.objectId,
        },
      };
    }
  } catch (error) {
    console.error('Failed to resolve asset ID:', error);
  }

  return null;
}

export function registerAssetIdProtocolHandler() {
  // The protocol handler registration is done in manifest.json
  // This function is a fallback for browsers that support registerProtocolHandler
  if ('registerProtocolHandler' in navigator) {
    try {
      (navigator as any).registerProtocolHandler(
        'asset-id',
        '/?asset-id=%s',
        'Stuffer - Asset ID Handler'
      );
    } catch (error) {
      console.log('Protocol handler registration not supported or already registered');
    }
  }
}

export function handleStartupURL(): URLNavigation | null {
  const params = new URLSearchParams(window.location.search);

  // Check for asset-id parameter
  const assetId = params.get('asset-id');
  if (assetId) {
    return parseAssetIdURL(assetId);
  }

  // Check for hash-based navigation (fallback)
  if (window.location.hash) {
    const hash = window.location.hash.substring(1);
    if (hash.startsWith('assetid=')) {
      const url = hash.substring(8);
      return parseAssetIdURL(url);
    }
  }

  return null;
}
