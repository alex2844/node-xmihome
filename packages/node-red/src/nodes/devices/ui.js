/** @import { EditorRED, EditorNodePropertiesDef } from 'node-red' */
/** @import { Config } from './runtime.js' */
/** @typedef {Config & { name: string }} ConfigDef */

let /** @type {EditorRED} */ RED = window['RED'];

RED.nodes.registerType('xmihome-devices', {
	category: 'Xiaomi MiHome',
	/** @type {EditorNodePropertiesDef<ConfigDef>} */ defaults: {
		settings: { value: null, required: true, type: 'xmihome-config' },
		name: { value: '' },
		timeout: { value: null }
	},
	icon: 'font-awesome/fa-list',
	inputs: 1,
	outputs: 1,
	color: '#00BC9C',
	paletteLabel: 'Devices',
	label: function () {
		return this.name || 'Devices';
	}
});
