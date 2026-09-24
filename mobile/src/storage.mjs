import { initialData } from './model.mjs';

export const STORAGE_KEY = 'norwe-scan-mobile-v1';

export function createRepository(storage) {
  let current = null;
  let queue = Promise.resolve();
  return {
    async load() {
      const raw = await storage.getItem(STORAGE_KEY);
      const data = raw === null ? initialData() : JSON.parse(raw);
      if (data.version !== 1 || !['students', 'admins', 'events', 'records'].every(key => Array.isArray(data[key]))) {
        throw new Error('Saved data cannot be opened. It has not been overwritten.');
      }
      if (raw === null) await storage.setItem(STORAGE_KEY, JSON.stringify(data));
      current = data;
      return data;
    },
    update(transform) {
      // Commit one complete snapshot before showing success; serialize rapid taps.
      const operation = queue.then(async () => {
        if (!current) throw new Error('Local storage is not ready.');
        const next = transform(current);
        await storage.setItem(STORAGE_KEY, JSON.stringify(next));
        current = next;
        return next;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
