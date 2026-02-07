/** @import { EditorRED, EditorNodePropertiesDef, EditorNodeInstance } from 'node-red' */
/** @import { Config as Device } from 'xmihome/device.js' */
/** @import { Config } from './runtime.js' */
/** @typedef {Config & { name: string }} ConfigDef */

let /** @type {EditorRED} */ RED = window['RED'];
let /** @type {EditorNodeInstance} */ node = null;

const CACHE_TTL = 60 * 1000;
let lastCacheTimestamp = 0;
let discoveredDevicesCache = [];

function validateDevice() {
	if (this.deviceType === 'msg')
		return true;
	if (this.deviceType === 'json')
		return getIdType(JSON.parse(this.device || '{}')) !== undefined;
	return false;
};

function getIdType(/** @type {Device} */ device) {
	if (device.address && device.token && !device.id.startsWith('blt.'))
		return 'miio';
	else if (device.mac && device.model)
		return 'bluetooth';
	else if (device.id)
		return 'cloud';
	else if (device.address)
		return 'miio';
	else if (device.mac)
		return 'bluetooth';
};

function formatDeviceLabel(/** @type {Device} */ device) {
	let label = device.name || device.model || device.mac || device.address || device.id || 'Unknown Device';
	let details = [];
	if (device.model && (label !== device.model))
		details.push(device.model);
	if (device.mac)
		details.push(device.mac);
	else if (device.address)
		details.push(device.address);
	else if (device.id)
		details.push(`DID: ${device.id}`);
	if (details.length > 0)
		label += ` (${details.join(', ')})`;
	return label;
};

function fetchDiscoveredDevices(/** @type {JQuery.ClickEvent<HTMLElement, null>} */ event) {
	const msg = $('#discovered-msg');
	const clientId = ($('#node-input-settings').val().toString() || '').replace('_ADD_', '');
	if (!clientId) {
		msg.text(node._('device.label.discoveredDeviceConfig')).show();
		devicesDropdown();
		return;
	}
	msg.text(node._('device.label.discoveredDeviceLoading')).show();
	$('#node-input-discovered-device, #node-button-refresh-devices').prop('disabled', true);
	$.getJSON(`xmihome/${clientId}/devices?force=${!!event}`)
		.done(function (data) {
			msg.hide();
			console.log(`[xmihome-device] Loaded ${data.devices?.length || 0} discovered devices for node ${node.id}.`);
			devicesDropdown(data.devices);
			lastCacheTimestamp = data.timestamp || 0;
		})
		.fail(function (jqXHR, textStatus, errorThrown) {
			msg.text(`Failed to load devices: ${textStatus}`).show();
			devicesDropdown();
			lastCacheTimestamp = 0;
			console.error(`[xmihome-device] Error fetching discovered devices for node ${node.id}: ${textStatus}`, errorThrown, jqXHR);
		})
		.always(function () {
			$('#node-input-discovered-device, #node-button-refresh-devices').prop('disabled', false);
		});
};

function devicesDropdown(/** @type {Device[]} */ devices) {
	const select = $('#node-input-discovered-device');
	select.empty();
	if (!devices || (devices.length === 0))
		return;
	discoveredDevicesCache = devices;
	devices.sort((a, b) => {
		const nameA = a.name || a.model || '';
		const nameB = b.name || b.model || '';
		return nameA.localeCompare(nameB);
	});
	select.append($('<option>', { value: '', text: '-- Select a device --', disabled: true }));
	devices.forEach(device => {
		const text = formatDeviceLabel(device);
		const value = JSON.stringify(device);
		select.append($('<option>', { value, text }));
	});
	select.val('');
};

function deviceParse(/** @type {string} */ input) {
	const /** @type {Device} */ device = JSON.parse(input || $('#node-input-device').typedInput('value') || '{}');
	$('.device-config input').val('');
	Object.entries(device).forEach(([key, value]) => $("#node-input-device-" + key).val(value));
	onchangeidtype(null, device);
	return device;
};

function onchangeidtype(/** @type {JQuery.ChangeEvent<HTMLElement, null>} */ _event, /** @type {Device} */ device) {
	const input = $('#node-input-deviceIdType');
	if (device)
		input.val(getIdType(device));
	const value = input.val();
	if (value) {
		$('.device-config').hide();
		$(`.device-config:not([class*="device-config-"]), .device-config-${value}`).show();
	} else
		$('.device-config').show();
	$('#node-button-open-model').prop('disabled', value === 'bluetooth');
};

function onchangedevice(/** @type {JQuery.ChangeEvent<HTMLElement, null>} */ event) {
	const input = $('#node-input-device');
	switch (event.target.id) {
		case 'node-input-deviceSource': {
			const typedinputContainer = $('#node-device-typedinput-container');
			const discoveredContainer = $('#node-device-discovered-container');
			switch (event.target.value) {
				case 'input': {
					typedinputContainer.show();
					discoveredContainer.hide();
					if (input.typedInput('type') !== 'json') {
						input.typedInput('type', 'json');
						input.typedInput('value', '{}');
					}
					deviceParse();
					break;
				};
				case 'discovered': {
					typedinputContainer.hide();
					discoveredContainer.show();
					if ((discoveredDevicesCache.length === 0) || ((Date.now() - lastCacheTimestamp) > CACHE_TTL))
						fetchDiscoveredDevices();
					else
						devicesDropdown(discoveredDevicesCache);
					break;
				};
				case 'msg': {
					typedinputContainer.hide();
					discoveredContainer.hide();
					input.typedInput('type', 'msg');
					input.typedInput('value', 'device');
					break;
				};
			};
			break;
		};
		case 'node-input-discovered-device': {
			input.typedInput('type', 'json');
			input.typedInput('value', event.target.value);
			$('#node-input-deviceSource').val('input').trigger('change');
			break;
		};
		default: {
			const device = JSON.parse(input.typedInput('value') || '{}');
			const key = event.target.id.split('-').pop();
			const value = event.target.value;
			device[key] = value;
			input.typedInput('value', JSON.stringify(device));
			break;
		};
	};
};

function onchangeaction() {
    const type = $('#node-input-actionType').val();
	const value = $(this).val();
	$('#node-config-row-property').toggle(!['getProperties', 'startMonitoring', 'stopMonitoring'].includes(value));
	$('#node-config-row-value').toggle(type === 'msg' || ['setProperty', 'callAction', 'callMethod'].includes(value));
};

function onchangeproperty() {
	const input = $('#node-input-property');
	const container = $('#node-property-typedinput-container');
	switch ($(this).val()) {
		case 'input': {
			container.show();
			input.typedInput('type', 'str');
			input.typedInput('value', '');
			break;
		};
		case 'msg': {
			container.hide();
			input.typedInput('type', 'msg');
			input.typedInput('value', 'property');
			break;
		};
	};
};

function onclickmodel() {
	const value = $('#node-input-device-model').val().toString().trim();
	let url = "https://home.miot-spec.com/";
	if (value !== '')
		url += `spec/${value}`;
	window.open(url, '_blank');
};

RED.nodes.registerType('xmihome-device', {
	category: 'Xiaomi MiHome',
	/** @type {EditorNodePropertiesDef<ConfigDef>} */ defaults: {
		settings: { value: null, required: true, type: 'xmihome-config' },
		name: { value: '' },
		device: { value: '{}', validate: validateDevice },
		deviceType: { value: 'json' },
		action: { value: 'getProperty', required: true },
		property: { value: '' },
		propertyType: { value: 'str' },
		value: { value: '' },
		valueType: { value: 'str' },
		topic: { value: 'topic' },
		topicType: { value: 'msg' }
	},
	icon: 'font-awesome/fa-power-off',
	inputs: 1,
	outputs: 2,
	color: '#00BC9C',
	paletteLabel: 'Device',
	label: function () {
		return this.name || this.action || 'Device';
	},
	outputLabels: ["Command Result / Notifications", "Connection Events"],
	oneditprepare: function () {
		node = this;
		$('#node-input-device').typedInput({
			typeField: '#node-input-deviceType',
			types: ['json', 'msg']
		});
		$('#node-input-property').typedInput({
			typeField: '#node-input-propertyType',
			types: ['str', 'msg', 'flow', 'global', 'json']
		});
		$('#node-input-value').typedInput({
			typeField: '#node-input-valueType',
			types: ['str', 'msg', 'flow', 'global', 'num', 'bool', 'json', 'date', 'jsonata']
		});
		$('#node-input-topic').typedInput({
			typeField: '#node-input-topicType',
			types: ['str', 'msg', 'flow', 'global']
		});

		$('#node-input-deviceSource, #node-input-discovered-device, .device-config input').on('change', onchangedevice);
		$('#node-button-refresh-devices').on('click', fetchDiscoveredDevices);
		if (this.deviceType === 'json')
			deviceParse(this.device);
		else if ((this.deviceType === 'msg') && (this.device === 'device'))
			$('#node-input-deviceSource').val('msg').trigger('change');
		$('#node-input-deviceIdType').on('change', onchangeidtype);
		$('#node-button-open-model').on('click', onclickmodel);
		$('#node-input-action').on('change', onchangeaction);
		$('#node-input-propertySource').on('change', onchangeproperty);
		if ((this.propertyType === 'msg') && (this.property === 'property'))
			$('#node-input-propertySource').val('msg').trigger('change');
	}
});
