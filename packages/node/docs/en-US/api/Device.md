# Class: Device

The base class for all Xiaomi devices. It provides a unified interface for
connecting, managing properties, and subscribing to notifications.

Instances of this class are typically created via the
`XiaomiMiHome.getDevice()` method.

## Static Methods

### `registerModels(models)`

Registers device classes from the `xmihome-devices` package, making them
available to `findModel` and `create`.

**Parameters:**

| Name     | Type     | Description                                                  |
| -------- | -------- | ------------------------------------------------------------ |
| `models` | `object` | An object where keys are models and values are device classes. |

### `getModels()`

Gets a list of all registered device models.

**Returns:**

- `string[]`: An array of model strings.

### `findModel(device)`

Finds the appropriate class for a device based on its `model` or `name`.

**Parameters:**

| Name     | Type     | Description                      |
| -------- | -------- | -------------------------------- |
| `device` | `object` | The device configuration object. |

**Returns:**

- `typeof Device \| undefined`: The found device class or `undefined`.

### `valid(device, model)`

Checks if the provided device configuration matches a specific model class.

**Parameters:**

| Name     | Type     | Description                          |
| -------- | -------- | ------------------------------------ |
| `device` | `object` | The device configuration object.     |
| `model`  | `class`  | The device class (constructor).      |

**Returns:**

- `boolean`: `true` if it matches, `false` otherwise.

### `create(device, client)`

Creates an instance of the correct device class (`Device` or a subclass)
based on the model. If no specific class is found for the model, it
attempts to load the specification from the MiOT cloud.

**Parameters:**

| Name     | Type           | Description                    |
| -------- | -------------- | ------------------------------ |
| `device` | `object`       | The device configuration object. |
| `client` | `XiaomiMiHome` | The main client instance.      |

**Returns:**

- `Promise<Device>`: A promise that resolves to a `Device` instance.

### `getDeviceId(device)`

Generates a unique string identifier for a device instance based on its
configuration.

**Parameters:**

| Name     | Type     | Description                      |
| -------- | -------- | -------------------------------- |
| `device` | `object` | The device configuration object. |

**Returns:**

- `string`: A unique key for the device.

### `getDeviceType(device, credentials)`

Determines the most likely connection type (`miio`, `bluetooth`, `cloud`)
based on the available fields in the device configuration.

**Parameters:**

| Name          | Type     | Description                   |
| ------------- | -------- | ----------------------------- |
| `device`      | `object` | The device configuration object. |
| `credentials` | `object` | (Optional) Cloud credentials. |

**Returns:**

- `'miio' \| 'bluetooth' \| 'cloud' \| undefined`: A string with the connection
  type.

## Properties

| Name             | Type      | Description                                                    |
| ---------------- | --------- | -------------------------------------------------------------- |
| `connectionType` | `string`  | The current connection type (`'miio'`, `'bluetooth'`, `'cloud'`) or `undefined`. |
| `isConnected`    | `boolean` | `true` if the device is currently connected.                   |
| `isConnecting`   | `boolean` | `true` if the device is in the process of initial connection.  |
| `isReconnecting` | `boolean` | `true` if the device is in the process of auto-reconnection.   |
| `properties`     | `object`  | Definitions of all device properties.                          |
| `actions`        | `object`  | Definitions of all device actions.                             |

## Events

Instances of the `Device` class emit the following events:

| Event                 | Payload              | Description                                        |
| --------------------- | -------------------- | -------------------------------------------------- |
| `connected`           | `string` (type)      | Emitted when a connection is established.          |
| `disconnect`          | -                    | Emitted when the device is disconnected.           |
| `reconnecting`        | `{ reason: string }` | Emitted when auto-reconnection starts.             |
| `reconnect_failed`    | `{ attempts: num }`  | Emitted when reconnection fails after all attempts.|
| `properties`          | `object`             | Emitted when device properties change.             |
| `external_disconnect` | `string` (reason)    | Emitted on unexpected hardware/bus disconnection.  |

## Methods

### `connect(connectionType)`

Establishes a connection to the device. The connection type is determined
automatically if not specified.

**Parameters:**

| Name             | Type     | Description                                                          |
| ---------------- | -------- | -------------------------------------------------------------------- |
| `connectionType` | `string` | (Optional) The preferred type (`'miio'`, `'bluetooth'`, `'cloud'`). |

**Returns:**

- `Promise<void>`

### `disconnect()`

Disconnects from the device.

**Returns:**

- `Promise<void>`

### `getName()`

Gets the name of the device.

**Returns:**

- `string`: The device name.

### `getModel()`

Gets the model identifier of the device.

**Returns:**

- `string`: The device model string.

### `getProperty(prop)`

Gets the value of a single property.

**Parameters:**

| Name   | Type              | Description                                                 |
| ------ | ----------------- | ----------------------------------------------------------- |
| `prop` | `string \| object` | The name of the property or the property definition object. |

**Returns:**

- `Promise<any>`: A promise that resolves with the property's value.

### `getProperties(properties)`

Gets the values of multiple properties.

**Parameters:**

| Name         | Type                   | Description                                                              |
| ------------ | ---------------------- | ------------------------------------------------------------------------ |
| `properties` | `(string \| object)[]` | (Optional) Array of properties to get.                                   |

**Returns:**

- `Promise<object>`: A promise that resolves to an object of `{ key: val }`.

### `setProperty(prop, value)`

Sets the value of a single property.

**Parameters:**

| Name    | Type              | Description                                                        |
| ------- | ----------------- | ------------------------------------------------------------------ |
| `prop`  | `string \| object` | The name of the property or the property definition object to set. |
| `value` | `any`             | The new value for the property.                                    |

**Returns:**

- `Promise<void>`

### `callAction(action, value)`

Calls a specific action on the device.

**Parameters:**

| Name     | Type              | Description                                             |
| -------- | ----------------- | ------------------------------------------------------- |
| `action` | `string \| object` | The name of the action or the action definition object. |
| `value`  | `any[]`           | (Optional) An array of parameters for the action.       |

**Returns:**

- `Promise<any>`: A promise that resolves with the result of the action.

### `startNotify(prop, callback)`

Subscribes to notifications for a property's value changes.

**Parameters:**

| Name       | Type              | Description                                                  |
| ---------- | ----------------- | ------------------------------------------------------------ |
| `prop`     | `string \| object` | The property name or definition object to subscribe to.      |
| `callback` | `function`        | Function called with the new value on each change.           |

**Returns:**

- `Promise<void>`

### `stopNotify(prop)`

Unsubscribes from notifications for a property.

**Parameters:**

| Name   | Type              | Description                                                  |
| ------ | ----------------- | ------------------------------------------------------------ |
| `prop` | `string \| object` | The property name or definition object to unsubscribe from. |

**Returns:**

- `Promise<void>`

### `startMonitoring(callback)`

Starts passive monitoring of advertisement packets (Bluetooth only).

**Parameters:**

| Name       | Type       | Description                                                |
| ---------- | ---------- | ---------------------------------------------------------- |
| `callback` | `function` | Function called with the parsed advertisement data.        |

**Returns:**

- `Promise<void>`

### `stopMonitoring()`

Stops the passive monitoring of advertisement packets.

**Returns:**

- `Promise<void>`

### `auth()`

Performs device-specific authentication logic.

**Returns:**

- `Promise<void>`

