import AsyncStorage from '@react-native-async-storage/async-storage';
import { createRepository, STORAGE_KEY } from './storage.mjs';
import { createIndexedDbStorage } from './indexeddb-storage.mjs';

export function createLocalRepository() {
  const indexedDb = createIndexedDbStorage();
  const storage = {
    async getItem(key) {
      const saved = await indexedDb.getItem(key);
      if (saved !== null) return saved;

      const legacy = await AsyncStorage.getItem(key);
      if (legacy !== null) await indexedDb.setItem(key, legacy);
      return legacy;
    },
    setItem: indexedDb.setItem,
  };
  const repository = createRepository(storage);

  return {
    ...repository,
    async load() {
      const data = await repository.load();
      await AsyncStorage.removeItem(STORAGE_KEY);
      return data;
    },
  };
}
