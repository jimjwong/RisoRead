import { openDb } from "@/lib/offline/db";

/**
 * What's been downloaded for offline reading, on this device.
 *
 * IndexedDB, not the service worker's Cache Storage, because a reader wants to
 * see a list — titles, sizes, when — and Cache Storage only knows URLs. Scoped
 * to a signed-in user explicitly, by keying every entry `${userId}:${bookId}`
 * and requiring `userId` as an argument everywhere, rather than this module
 * asking "who's signed in" itself: the service worker's cross-user protection
 * (see public/sw.js) only matters if every caller of this module carries the
 * same discipline. A future caller that read "the current user" from inside
 * here instead would reopen the exact leak that exists to prevent.
 */

export type DownloadEntry = {
  userId: string;
  bookId: string;
  format: "pdf" | "epub";
  title: string;
  totalUnits: number;
  bytesApprox: number;
  downloadedAt: string;
  /** Which single JPEG width was actually cached — only set for PDFs. The
   * reader needs this to point the image at a URL it knows is cached, rather
   * than trusting the responsive srcset to land on the same one. */
  pdfWidth?: number;
  /** Every URL this download cached — so removing it later needs no network
   * round trip to work out what to evict, even for an EPUB's images. */
  urls: string[];
};

const STORE = "downloads";

function keyFor(userId: string, bookId: string): string {
  return `${userId}:${bookId}`;
}

export async function put(entry: DownloadEntry): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...entry, key: keyFor(entry.userId, entry.bookId) });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function remove(userId: string, bookId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(keyFor(userId, bookId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function get(userId: string, bookId: string): Promise<DownloadEntry | null> {
  const db = await openDb();
  const row = await new Promise<DownloadEntry | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(keyFor(userId, bookId));
    req.onsuccess = () => resolve((req.result as DownloadEntry | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return row;
}

export async function list(userId: string): Promise<DownloadEntry[]> {
  const db = await openDb();
  const rows = await new Promise<DownloadEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const index = tx.objectStore(STORE).index("by-user");
    const req = index.getAll(userId);
    req.onsuccess = () => resolve(req.result as DownloadEntry[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows;
}
