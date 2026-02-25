# Class: Bluetooth

A class for low-level interaction with Bluetooth LE devices via D-Bus. It is
typically used internally by the `XiaomiMiHome` client.

## Static Methods

### `createBluetooth()`

Creates and initializes a new instance of the Bluetooth class. This is the
recommended way to create a standalone instance.

**Returns:**

- `Promise<Bluetooth>`: A promise that resolves with the initialized
  Bluetooth instance.

## Methods

### `registerBindKey(mac, bindkey)`

Registers a bindkey for a specific device. This is required for decrypting
advertisements from protected MiBeacon (BLE) devices.

**Parameters:**

| Name      | Type     | Description                             |
| --------- | -------- | --------------------------------------- |
| `mac`     | `string` | The MAC address of the device.          |
| `bindkey` | `string` | The 16-byte hex-encoded decryption key. |

### `checkBlueZService()`

Checks if the BlueZ service (the standard Linux Bluetooth stack) is
available via D-Bus. This is useful for diagnosing Bluetooth issues on Linux
systems before attempting to initialize an adapter.

**Returns:**

- `Promise<boolean>`: A promise that resolves to `true` if the service is
  available, and `false` otherwise.

### `startDiscovery(filters)`

Starts scanning for Bluetooth LE devices.

**Parameters:**

| Name      | Type       | Description                                              |
| --------- | ---------- | -------------------------------------------------------- |
| `filters` | `string[]` | (Optional) An array of service UUIDs to filter the scan. |

**Returns:**

- `Promise<boolean>`: A promise that resolves to `true` if discovery was
  successfully started.

### `stopDiscovery()`

Stops scanning for Bluetooth LE devices.

**Returns:**

- `Promise<void>`

### `getDevice(mac)`

Gets a proxy object to interact with a Bluetooth device by its MAC address.
If the device is not found in the cache, it will perform a discovery scan.

**Parameters:**

| Name  | Type     | Description                    |
| ----- | -------- | ------------------------------ |
| `mac` | `string` | The MAC address of the device. |

**Returns:**

- `Promise<object>`: A promise that resolves with the device proxy object,
  which provides methods like `connect`, `disconnect`, `getCharacteristic`, etc.

### `waitDevice(mac, ms)`

Waits for a specific Bluetooth device to be discovered.

**Parameters:**

| Name  | Type               | Description                                                                     |
| ----- | ------------------ | ------------------------------------------------------------------------------- |
| `mac` | `string`           | The MAC address of the device to wait for.                                      |
| `ms`  | `number` \| `null` | (Optional) Max time to wait in ms. If `null`, waits indefinitely.               |

**Returns:**

- `Promise<object>`: A promise that resolves with the configuration object of
  the found device.

### `removeDevice(mac)`

Removes the device from the BlueZ cache and disconnects it if connected.

**Parameters:**

| Name  | Type     | Description                    |
| ----- | -------- | ------------------------------ |
| `mac` | `string` | The MAC address of the device. |

**Returns:**

- `Promise<boolean>`

### `startMonitoring()`

Starts the passive monitoring mode for advertisement packets.

**Returns:**

- `Promise<boolean>`

### `stopMonitoring()`

Stops the passive monitoring mode.

**Returns:**

- `Promise<void>`

### `defaultAdapter(device)`

Initializes the default Bluetooth adapter. This method is usually called
internally.

**Parameters:**

| Name     | Type     | Description                                               |
| -------- | -------- | --------------------------------------------------------- |
| `device` | `string` | (Optional) The name of the adapter to use (e.g., `hci0`). |

**Returns:**

- `Promise<object>`: A promise that resolves with the adapter interface object.

### `extractProperties(properties)`

Extracts properties from a D-Bus Variant object. This is a utility method
used internally to process data received from D-Bus.

**Parameters:**

| Name         | Type     | Description                                           |
| ------------ | -------- | ----------------------------------------------------- |
| `properties` | `object` | The D-Bus properties object containing Variant values. |

**Returns:**

- `object`: A plain JavaScript object with extracted properties.

### `destroy()`

Releases resources, stops scanning, and disconnects all connected devices.

**Returns:**

- `Promise<void>`

## Events

The `Bluetooth` class emits the following events:

| Event                  | Payload  | Description                                        |
| ---------------------- | -------- | -------------------------------------------------- |
| `adapter`              | `object` | Emitted when Bluetooth adapter properties change.   |
| `available`            | `object` | Emitted when any new Bluetooth device is found.    |
| `available:dev_${id}`  | `object` | Emitted when a specific device is discovered.      |
| `advertisement`        | `object` | Emitted when any BLE advertisement is parsed.      |
| `advertisement:${mac}` | `object` | Emitted when a specific device sends a beacon.     |
| `properties:${id}`     | `object` | Emitted when D-Bus properties of a device change.  |

