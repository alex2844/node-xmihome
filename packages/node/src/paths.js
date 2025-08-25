import { homedir } from 'os';
import path from 'path';

/** Путь к директории конфигурации. */
export const CONFIG_DIR = path.join(homedir(), '.config', 'xmihome');

/** Полный путь к файлу с учетными данными. */
export const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');

/** Полный путь к файлу с временным кешем устройств. */
export const DEVICE_CACHE_FILE = path.join(CONFIG_DIR, 'device_cache.json');

/** Полный путь к файлу с долгосрочным списком устройств из облака. */
export const CLOUD_DEVICE_LIST_FILE = path.join(CONFIG_DIR, 'cloud_device_list.json');

/** Раскрывает тильду в полный путь */
export const expandPath = (/** @type {string} */ filePath) => filePath.replace(/^~/, homedir());
