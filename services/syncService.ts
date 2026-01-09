export interface SyncResult {
  success: boolean;
  itemsPushed: number;
  itemsPulled: number;
  errors: string[];
}

export async function performFullSync(token: string): Promise<SyncResult> {
  return {
    success: true,
    itemsPushed: 0,
    itemsPulled: 0,
    errors: []
  };
}

export async function pushPendingChanges(token: string): Promise<{ success: boolean; pushed: number; errors: string[] }> {
  return { success: true, pushed: 0, errors: [] };
}

export async function pullServerChanges(token: string): Promise<{ success: boolean; pulled: number; errors: string[] }> {
  return { success: true, pulled: 0, errors: [] };
}

export async function getSyncStatus(token: string): Promise<{ lastSync: string | null; pendingCount: number }> {
  return { lastSync: null, pendingCount: 0 };
}
