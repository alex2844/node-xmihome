# Class: Device

The base class for all Xiaomi devices. It provides a unified interface for connecting, managing properties, and subscribing to notifications.

Instances of this class are typically created via the `XiaomiMiHome.getDevice()` method.

## Properties

| Name | Type | Description |
|---|---|---|
| `connectionType` | `string` | The current connection type (`'miio'`, `'bluetooth'`, `'cloud'`) or `undefined` if not connected. |
| `isConnected` | `boolean` | `true` if the device is currently connected. |
| `isConnecting` | `boolean` | `true` if the device is in the process of initial connection. |
| `isReconnecting` | `boolean` | `true` if the device is in the process of automatic reconnection. |
| `properties` | `object` | An object containing the definitions of all device properties. |

## Methods

### `connect(connectionType)`

Establishes a connection to the device. The connection type is determined automatically if not specified.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `connectionType` | `string` | (Optional) The preferred connection type (`'miio'`, `'bluetooth'`, `'cloud'`). |

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

| Name | Type | Description |
|---|---|---|
| `prop` | `string` | The name of the property to get. |

**Returns:**

- `Promise<any>`: A promise that resolves with the property's value.

### `getProperties(properties)`

Gets the values of multiple properties. If `properties` is not provided, it requests all readable properties.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `properties` | `string[]` | (Optional) An array of property names to get. |

**Returns:**

- `Promise<object>`: A promise that resolves to an object of `{ propertyName: value, ... }`.

### `setProperty(prop, value)`

Sets the value of a single property.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `prop` | `string` | The name of the property to set. |
| `value` | `any` | The new value for the property. |

**Returns:**

- `Promise<void>`

### `startNotify(prop, callback)`

Subscribes to notifications for a property's value changes.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `prop` | `string` | The name of the property to subscribe to. |
| `callback` | `function` | The function to be called with the new value on each change. |

**Returns:**

- `Promise<void>`

### `stopNotify(prop)`

Unsubscribes from notifications for a property.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `prop` | `string` | The name of the property to unsubscribe from. |

**Returns:**

- `Promise<void>`

### `auth()`

Performs device-specific authentication logic. This method is intended to be overridden by subclasses for devices that require special authentication (e.g., Mi Kettle).

**Returns:**

- `Promise<void>`
