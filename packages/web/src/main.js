import Device from './device.js';
import { devices } from 'xmihome-devices/bluetooth.js';

Device.registerModels(devices);

/**
 * Записывает лог-сообщение.
 * Учитывает logLevel, установленный в конструкторе, и переменную окружения NODE_DEBUG=xmihome.
 * @param {('error'|'warn'|'info'|'debug')} level Уровень сообщения.
 * @param {...any} args Аргументы для логирования (как в console.log).
 */
function log(level, ...args) {
	const prefix = `[${level.toUpperCase()}]`;
	const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
	logOutput.textContent += `${prefix} ${message}\n`;
	logOutput.scrollTop = logOutput.scrollHeight;
	console[level](...args);
};

/** @type {Device|null} */
let activeDevice = null;

// Явное приведение типов для DOM-элементов
const deviceSelector = /** @type {HTMLSelectElement} */ (document.getElementById('device-selector'));
const modelSelector = /** @type {HTMLSelectElement} */ (document.getElementById('model-selector'));
const connectButton = /** @type {HTMLButtonElement} */ (document.getElementById('connect-button'));
const devicePanel = /** @type {HTMLDivElement} */ (document.getElementById('device-panel'));
const deviceNameEl = /** @type {HTMLHeadingElement} */ (document.getElementById('device-name'));
const deviceActionsEl = /** @type {HTMLDivElement} */ (document.getElementById('device-actions'));
const disconnectButton = /** @type {HTMLButtonElement} */ (document.getElementById('disconnect-button'));
const logOutput = /** @type {HTMLPreElement} */ (document.getElementById('log-output'));

function hideDevicePanel() {
	devicePanel.hidden = true;
	deviceActionsEl.innerHTML = '';
};

/** @param {Device} device */
function showDevicePanel(device) {
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
			actionItem.appendChild(button);
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
			actionItem.appendChild(button);
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
			actionItem.appendChild(button);
		}
		deviceActionsEl.appendChild(actionItem);
	}
	devicePanel.hidden = false;
};

async function connectToDevice() {
	const device = deviceSelector.value;
	const model = modelSelector.value || devices[device]?.models?.[0];
	if (!model || activeDevice)
		return;
	logOutput.textContent = '';
	log('info', 'Starting connection...');
	connectButton.disabled = true;
	connectButton.textContent = 'Connecting...';
	try {
		activeDevice = await Device.create({ model }, { log });
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
	deviceSelector.disabled = false;
	modelSelector.disabled = false;
	modelSelector.hidden = true;
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
	});
	modelSelector.addEventListener('change', () => {
		connectButton.disabled = !modelSelector.value;
	});
	connectButton.addEventListener('click', connectToDevice);
	disconnectButton.addEventListener('click', disconnectDevice);
};

main();
