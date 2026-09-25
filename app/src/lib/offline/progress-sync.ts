import { openDb } from "@/lib/offline/db";

/**
 * Where a reader left off, recorded locally first and pushed to the server
 * when possible.
 *
 * One row per (userId, bookId), not a queue of every position visited —
 * once a newer position is recorded, an older unsynced one is simply moot,
 * so there is nothing to keep around for it.
 */

export type ProgressEntry = {
  key: string;
  userId: string;
  bookId: string;
  at: number;
  syncedAt: string | null;
};

const STORE = "progress";

function keyFor(userId: string, bookId: string): string {
  return `${userId}:${bookId}`;
}

async function putLocal(
  userId: string,
  bookId: string,
  at: number,
  syncedAt: string | null,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ key: keyFor(userId, bookId), userId, bookId, at, syncedAt });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listUnsynced(userId: string): Promise<ProgressEntry[]> {
  const db = await openDb();
  const rows = await new Promise<ProgressEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("by-user").getAll(userId);
    req.onsuccess = () => resolve(req.result as ProgressEntry[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.filter((r) => r.syncedAt === null);
}

async function trySync(userId: string, bookId: string, at: number): Promise<boolean> {
  try {
    const res = await fetch(`/books/${bookId}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at }),
    });
    if (!res.ok) return false;
    await putLocal(userId, bookId, at, new Date().toISOString());
    return true;
  } catch {
    // Offline, or the request otherwise failed — the local row stays
    // unsynced for the next retry. Not an application error.
    return false;
  }
}

/** Record a page turn locally, then try to push it. Never throws. */
export async function recordProgress(userId: string, bookId: string, at: number): Promise<void> {
  await putLocal(userId, bookId, at, null);
  await trySync(userId, bookId, at);
}

/** Retry every position this user turned to while disconnected. */
export async function syncAll(userId: string): Promise<void> {
  for (const row of await listUnsynced(userId)) {
    await trySync(row.userId, row.bookId, row.at);
  }
}
