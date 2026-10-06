import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { createSqliteRepository } from './sqlite-storage.mjs';

export function createLocalRepository() {
  return createSqliteRepository(SQLite.openDatabaseAsync, AsyncStorage);
}
