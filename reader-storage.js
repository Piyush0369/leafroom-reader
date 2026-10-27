/* IndexedDB keeps book files and small reading-state records on this device. */
class ReaderStorage {
  constructor() {
    this.db = new Promise((resolve, reject) => {
      const request = indexedDB.open('folio-library', 1);
      request.onupgradeneeded = () => {
        for (const name of ['files', 'states', 'meta']) request.result.createObjectStore(name);
      };
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Local library is blocked by another tab.'));
    });
  }
  async transaction(stores, mode, work) {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result;
      tx.oncomplete = () => resolve(result?.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Local storage is unavailable.'));
      try { result = work(tx); } catch (error) { tx.abort(); reject(error); }
    });
  }
  get(store, key) { return this.transaction([store], 'readonly', tx => tx.objectStore(store).get(key)); }
  list() { return this.transaction(['files'], 'readonly', tx => tx.objectStore('files').getAll()); }
  saveFile(id, file, title) {
    return this.transaction(['files'], 'readwrite', tx => tx.objectStore('files').put({id, file, title}, id));
  }
  saveState(id, state) {
    return this.transaction(['states','meta'], 'readwrite', tx => {
      tx.objectStore('states').put(state, id);
      tx.objectStore('meta').put(id, 'last-book');
    });
  }
  static bookmarkId() {
    // getRandomValues also works on plain HTTP during same-Wi-Fi previews.
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  }
  static async identify(file) {
    // Content-based identity survives renamed files and distinguishes same-name books.
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,'0')).join('');
  }
}
window.ReaderStorage = ReaderStorage;
