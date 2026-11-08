/* ==========================================================================
   db.ts — Wrapper IndexedDB para Recibos e Dados Pesados
   ========================================================================== */

const DB_NAME = 'lumen_db';
const DB_VERSION = 1;
const STORE_NAME = 'attachments';

export interface StoredAttachment<T = unknown> {
  id: string;
  payload: T;
  updatedAt: number;
}

/**
 * Abre conexão com o IndexedDB de forma assíncrona.
 */
export const openDB = (): Promise<IDBDatabase | null> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/**
 * Salva um registro pesado (ex.: comprovante/recibo) no IndexedDB.
 */
export const putItem = async <T = unknown>(id: string, payload: T): Promise<boolean> => {
  try {
    const db = await openDB();
    if (!db) return false;
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const record: StoredAttachment<T> = { id, payload, updatedAt: Date.now() };
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    return false;
  }
};

/**
 * Recupera um item pelo id no IndexedDB.
 */
export const getItem = async <T = unknown>(id: string): Promise<T | null> => {
  try {
    const db = await openDB();
    if (!db) return null;
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => {
        const result = req.result as StoredAttachment<T> | undefined;
        resolve(result ? result.payload : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
};

/**
 * Remove um item pelo id no IndexedDB.
 */
export const deleteItem = async (id: string): Promise<boolean> => {
  try {
    const db = await openDB();
    if (!db) return false;
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    return false;
  }
};

/**
 * Limpa todos os itens armazenados no IndexedDB.
 */
export const clearStore = async (): Promise<boolean> => {
  try {
    const db = await openDB();
    if (!db) return false;
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    return false;
  }
};
