/**
 * The one IndexedDB database the offline engine keeps on this device, shared
 * by manifest.ts (what's downloaded) and progress-sync.ts (where a reader
 * left off while offline). One opener, so a schema change only ever races
 * itself once, not two modules independently opening the same database name.
 */

export const DB_NAME = "riso-offline";
export const DB_VERSION = 2;

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("downloads")) {
        db.createObjectStore("downloads", { keyPath: "key" }).createIndex("by-user", "userId");
      }
      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", { keyPath: "key" }).createIndex("by-user", "userId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
