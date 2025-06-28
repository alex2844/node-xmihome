import { devices as bluetooth } from './bluetooth.js';
import { devices as miot } from './miot.js';

/**
 * Единая карта всех известных классов устройств,
 * объединенная из разных типов подключения.
 * @type {Object.<string, typeof import('xmihome').Device>}
 */
export const devices = { ...bluetooth, ...miot };
