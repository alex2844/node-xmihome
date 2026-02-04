import { devices as bluetooth } from './bluetooth.js';
import { devices as miot } from './miot.js';
/** @import { Device } from 'xmihome' */

/**
 * Единая карта всех известных классов устройств,
 * объединенная из разных типов подключения.
 * @type {Object.<string, typeof Device>}
 */
export const devices = { ...bluetooth, ...miot };
