# Class: Miot

A class for interacting with the Xiaomi Cloud and devices via the MiIO protocol. It is typically used internally by the `XiaomiMiHome` client.

## Static Methods

### `findModel(model)`

Searches for a device specification on `miot-spec.org` by its model name.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `model` | `string` | The device model (e.g., `deerma.humidifier.jsq2w`). |

**Returns:**

- `Promise<object|undefined>`: A promise that resolves with the specification object, or `undefined` if the model is not found.

## Properties

| Name | Type | Description |
|---|---|---|
| `credentials` | `object` | Provides access to the cloud credentials (`username`, `password`, `country`, etc.) from the main client configuration. |
| `miio` | `object` | Direct access to the `mijia-io` library for low-level MiIO operations. |

## Methods

### `login()`

Logs into the Xiaomi account to obtain tokens required for cloud requests. It is called automatically on the first cloud request.

**Returns:**

- `Promise<void>`

### `request(path, data)`

Executes a signed request to the Xiaomi Cloud API.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `path` | `string` | The API endpoint path (e.g., `/home/device_list`). |
| `data` | `object` | The data object to send. |

**Returns:**

- `Promise<object>`: A promise that resolves with the JSON response from the server.
