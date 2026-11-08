/* ==========================================================================
   db.js — Wrapper IndexedDB para Recibos e Dados Pesados
   ========================================================================== */

const DB_NAME = 'lumen_db';
const DB_VERSION = 1;
const STORE_NAME = 'attachments';

/**
 * Abre conexão com o IndexedDB de forma assíncrona.
 */
export const openDB = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return resolve(null);
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
export const putItem = async (id, payload) => {
  try {
    const db = await openDB();
    if (!db) return false;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id, payload, updatedAt: Date.now() });
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
export const getItem = async (id) => {
  try {
    const db = await openDB();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result ? req.result.payload : null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
};

/**
 * Remove um item pelo id no IndexedDB.
 */
export const deleteItem = async (id) => {
  try {
    const db = await openDB();
    if (!db) return false;
    return await new Promise((resolve, reject) => {
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
export const clearStore = async () => {
  try {
    const db = await openDB();
    if (!db) return false;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    return false;
  }
};
