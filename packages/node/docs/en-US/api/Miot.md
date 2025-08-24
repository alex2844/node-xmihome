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

### `login(handlers)`

Logs into the Xiaomi account to obtain tokens required for cloud requests. It is called automatically on the first cloud request. Supports two-factor authentication (2FA) via a callback.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `handlers` | `object` | (Optional) An object with handlers for interactive steps. |
| `handlers.on2fa` | `(url: string) => Promise<string>` | (Optional) An async function that is called if 2FA is required. It receives a verification `url` and must return a promise that resolves with the confirmation code (`ticket`) entered by the user. |


**Returns:**

- `Promise<object>`: A promise that resolves with an object containing the tokens (`userId`, `ssecurity`, `serviceToken`).

### `request(path, data)`

Executes a signed request to the Xiaomi Cloud API.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `path` | `string` | The API endpoint path (e.g., `/home/device_list`). |
| `data` | `object` | The data object to send. |

**Returns:**

- `Promise<object>`: A promise that resolves with the JSON response from the server.

### `parseJson(str)`

Parses a JSON string, removing the `&&&START&&&` prefix if present.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `str` | `string` | The JSON string. |

**Returns:**

- `object`: The parsed JSON object.

### `getApiUrl(country)`

Returns the API URL for the specified country.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `country` | `string` | The country code (e.g., `ru`, `cn`). |

**Returns:**

- `string`: The API URL.

### `generateSignature(path, _signedNonce, nonce, params)`

Generates a request signature for the Xiaomi Cloud API.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `path` | `string` | The API request path. |
| `_signedNonce` | `string` | The signed nonce. |
| `nonce` | `string` | The nonce. |
| `params` | `object` | The request parameters. |

**Returns:**

- `string`: The request signature in base64.

### `generateNonce()`

Generates a nonce for Xiaomi Cloud API requests.

**Returns:**

- `string`: The nonce in base64.

### `signedNonce(ssecret, nonce)`

Generates a signed nonce.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `ssecret` | `string` | The `ssecurity` token. |
| `nonce` | `string` | The nonce. |

**Returns:**

- `string`: The signed nonce in base64.
