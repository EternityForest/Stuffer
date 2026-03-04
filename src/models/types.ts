export interface ContentRecord {
  itemUUID: string;
  amount: number;
}

export interface LogEntry {
  text: string;
  time: number;
  author: string;
}

export interface StufferObject {
  title: string;
  uuid: string;
  description: string;
  contents: ContentRecord[];
  selectedLoadout: string | null;
  lastScanTime: number;
  lastScanLocation?: string;
  log: LogEntry[];
  container: string | null;
}

export interface Loadout {
  title: string;
  uuid: string;
  description: string;
  contents: ContentRecord[];
}

export interface Workspace {
  name: string;
  syncRoomKey: string;
  objects: Record<string, StufferObject>;
  loadouts: Record<string, Loadout>;
}
