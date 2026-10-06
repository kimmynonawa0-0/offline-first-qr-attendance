import AsyncStorage from '@react-native-async-storage/async-storage';
import { createRepository } from './storage.mjs';

export function createLocalRepository() {
  return createRepository(AsyncStorage);
}
