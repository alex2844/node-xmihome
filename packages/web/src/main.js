import Device from './device.js';
import { devices } from 'xmihome-devices/bluetooth.js';

Device.registerModels(devices);

/** @type {Device|null} */
let activeDevice = null;

// Явное приведение типов для DOM-элементов
const deviceSelector = /** @type {HTMLSelectElement} */ (document.getElementById('device-selector'));
const modelSelector = /** @type {HTMLSelectElement} */ (document.getElementById('model-selector'));
const connectButton = /** @type {HTMLButtonElement} */ (document.getElementById('connect-button'));
const deviceSchema = /** @type {HTMLFieldSetElement} */ (document.getElementById('device-schema'));
const devicePanel = /** @type {HTMLFieldSetElement} */ (document.getElementById('device-panel'));
const deviceNameEl = /** @type {HTMLLegendElement} */ (document.getElementById('device-name'));
const deviceActionsEl = /** @type {HTMLDivElement} */ (document.getElementById('device-actions'));
const disconnectButton = /** @type {HTMLButtonElement} */ (document.getElementById('disconnect-button'));
const logContainer = /** @type {HTMLDivElement} */ (document.getElementById('log-container'));
const logOutput = /** @type {HTMLPreElement} */ (document.getElementById('log-output'));

/**
 * Записывает лог-сообщение.
 * Учитывает logLevel, установленный в конструкторе, и переменную окружения NODE_DEBUG=xmihome.
 * @param {('error'|'warn'|'info'|'debug')} level Уровень сообщения.
 * @param {...any} args Аргументы для логирования (как в console.log).
 */
function log(level, ...args) {
	if (logContainer.hidden)
		logContainer.hidden = false;
	const prefix = `[${level.toUpperCase()}]`;
	const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
	logOutput.textContent += `${prefix} ${message}\n`;
	logOutput.scrollTop = logOutput.scrollHeight;
	console[level](...args);
};

function hideDevicePanel() {
	connectButton.hidden = false;
	disconnectButton.hidden = true;
	devicePanel.hidden = true;
	deviceActionsEl.innerHTML = '';
};

/** @param {Device} device */
function showDevicePanel(device) {
	connectButton.hidden = true;
	disconnectButton.hidden = false;
	deviceSelector.disabled = true;
	modelSelector.disabled = true;
	deviceNameEl.textContent = device.constructor.name;
	for (const [key, prop] of Object.entries(device.properties)) {
		const canRead = prop.access?.includes('read');
		const canWrite = prop.access?.includes('write');
		const canNotify = prop.access?.includes('notify');
		if (!canRead && !canWrite && !canNotify)
			continue;

		const actionItem = document.createElement('div');
		actionItem.className = 'action-item';

		const label = document.createElement('label');
		label.textContent = key;
		actionItem.appendChild(label);

		const valueInput = document.createElement('input');
		valueInput.type = 'text';
		valueInput.placeholder = 'value';
		actionItem.appendChild(valueInput);

		const buttonContainer = document.createElement('div');
		buttonContainer.className = 'action-buttons';

		if (canRead) {
			const button = document.createElement('button');
			button.textContent = 'Read';
			button.onclick = async () => {
				try {
					log('info', `Reading ${key}...`);
					const value = await device.getProperty(key);
					const valueStr = JSON.stringify(value);
					log('info', `Result for ${key}: ${valueStr}`);
					valueInput.value = valueStr;
				} catch (err) {
					log('error', `Read ${key}:`, err.message);
				}
			};
			buttonContainer.appendChild(button);
		}

		if (canWrite) {
			const button = document.createElement('button');
			button.textContent = 'Write';
			button.onclick = async () => {
				try {
					let value = valueInput.value;
					try { value = JSON.parse(value); } catch (e) {}
					log('info', `Writing ${key} = ${JSON.stringify(value)}`);
					await device.setProperty(key, value);
					log('info', `Result for ${key} set successfully.`);
				} catch (err) {
					log('error', `Write ${key}:`, err.message);
				}
			};
			buttonContainer.appendChild(button);
		}

		if (canNotify) {
			const button = document.createElement('button');
			let isSubscribed = false;
			button.textContent = 'Subscribe';
			button.onclick = async () => {
				if (isSubscribed) {
					try {
						await device.stopNotify(key);
						log('info', `Unsubscribed from ${key}.`);
						button.textContent = 'Subscribe';
						isSubscribed = false;
					} catch (err) {
						log('error', `Unsubscribe ${key}:`, err.message);
					}
				} else {
					try {
						await device.startNotify(key, (/** @type {any} */ value) => {
							const valueStr = JSON.stringify(value);
							log('info', `[NOTIFY] ${key}: ${valueStr}`);
							valueInput.value = valueStr;
						});
						log('info', `Subscribed to ${key}.`);
						button.textContent = 'Unsubscribe';
						isSubscribed = true;
					} catch (err) {
						log('error', `Subscribe ${key}:`, err.message);
					}
				}
			};
			buttonContainer.appendChild(button);
		}
		actionItem.appendChild(buttonContainer);
		deviceActionsEl.appendChild(actionItem);
	}
	devicePanel.hidden = false;
};

async function connectToDevice() {
	const { models, schema } = devices[deviceSelector.value] || {};
	const model = modelSelector.value || models?.[0];
	if (!model || activeDevice)
		return;
	const device = { model };
	if (schema) {
		for (const field of schema.fields) {
			const inputId = `schema-input-${models?.[0] || deviceSelector.value}-${field.key}`;
			const input = /** @type {HTMLInputElement|HTMLSelectElement} */ (document.getElementById(inputId));
			if (input && input.value) {
				if (schema.key) {
					if (!device[schema.key])
						device[schema.key] = {};
					device[schema.key][field.key] = input.value;
				} else
					device[field.key] = input.value;
				localStorage.setItem(inputId, input.value);
			}
		}
		deviceSchema.hidden = true;
	}
	logContainer.hidden = true;
	logOutput.textContent = '';
	log('info', 'Starting connection...');
	connectButton.disabled = true;
	connectButton.textContent = 'Connecting...';
	try {
		activeDevice = await Device.create(device, { log });
		await activeDevice.connect();
		log('info', 'Connected successfully!');
		showDevicePanel(activeDevice);
	} catch (error) {
		log('error', 'Connection failed:', error.message);
		console.error(error);
		await disconnectDevice();
	} finally {
		connectButton.disabled = false;
		connectButton.textContent = 'Connect';
	}
};

async function disconnectDevice() {
	if (!activeDevice)
		return;
	try {
		await activeDevice.disconnect();
		log('info', 'Disconnected.');
	} catch (error) {
		log('error', 'Disconnect failed:', error.message);
	}
	activeDevice = null;
	hideDevicePanel();
	updateSchemaForm();
	deviceSelector.disabled = false;
	modelSelector.disabled = false;
	modelSelector.hidden = true;
};

function updateSchemaForm() {
	deviceSchema.innerHTML = '';
	const device = deviceSelector.value;
	const { models, schema } = devices[device] || {};
	if (!schema) {
		deviceSchema.hidden = true;
		return;
	}
	const legend = document.createElement('legend');
	legend.textContent = 'Device Configuration';
	deviceSchema.appendChild(legend);
	for (const field of schema.fields) {
		const fieldWrapper = document.createElement('div');
		fieldWrapper.className = 'schema-field';

		const inputId = `schema-input-${models?.[0] || device}-${field.key}`;

		const label = document.createElement('label');
		label.textContent = field.key;
		label.htmlFor = inputId;

		let input;
		if (field.type === 'select') {
			input = document.createElement('select');
			for (const value of field.options) {
				const option = document.createElement('option');
				option.value = option.text = value;
				input.appendChild(option);
			}
		} else {
			input = document.createElement('input');
			input.type = field.type;
		}

		input.id = inputId;
		input.name = field.key;

		const savedValue = localStorage.getItem(inputId);
		if (savedValue)
			input.value = savedValue;

		fieldWrapper.appendChild(label);
		fieldWrapper.appendChild(input);
		deviceSchema.appendChild(fieldWrapper);
	}
	deviceSchema.hidden = false;
};

function updateModelSelector() {
	modelSelector.innerHTML = '';
	const device = deviceSelector.value;
	const models = devices[device]?.models || [];
	if (models.length > 1) {
		modelSelector.hidden = false;
		const defaultOption = document.createElement('option');
		defaultOption.value = '';
		defaultOption.textContent = '-- Select model --';
		modelSelector.appendChild(defaultOption);
		for (const model of models) {
			const option = document.createElement('option');
			option.value = model;
			option.textContent = model;
			modelSelector.appendChild(option);
		}
		connectButton.disabled = true;
	} else {
		modelSelector.hidden = true;
		connectButton.disabled = false;
	}
};

async function main() {
	const defaultOption = document.createElement('option');
	defaultOption.value = '';
	defaultOption.textContent = '-- Select model --';
	deviceSelector.appendChild(defaultOption);
	for (const model of Device.getModels()) {
		const device = devices[model];
		const option = document.createElement('option');
		option.value = model;
		option.textContent = device.name || model;
		deviceSelector.appendChild(option);
	}
	deviceSelector.addEventListener('change', () => {
		connectButton.disabled = !deviceSelector.value;
		if (deviceSelector.value)
			updateModelSelector();
		updateSchemaForm();
	});
	modelSelector.addEventListener('change', () => {
		connectButton.disabled = !modelSelector.value;
	});
	connectButton.addEventListener('click', connectToDevice);
	disconnectButton.addEventListener('click', disconnectDevice);
};

main();
