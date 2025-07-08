# Class: XiaomiMiHome

The main class for interacting with Xiaomi Mi Home devices. It manages connections, device discovery, and provides access to device instances.

## Constructor

### `new XiaomiMiHome(config)`

Creates a new instance of the `XiaomiMiHome` client.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `config` | `object` | The configuration object. |
| `config.credentials` | `object` | (Optional) Credentials for Xiaomi Cloud. Required for cloud operations. |
| `config.credentials.username` | `string` | Xiaomi account username. |
| `config.credentials.password` | `string` | Xiaomi account password. |
| `config.credentials.country` | `string` | Xiaomi account region (e.g., `ru`, `cn`, `us`). |
| `config.connectionType` | `string` | (Optional) The default connection type to use for device discovery and connection (`'cloud'`, `'miio'`, `'bluetooth'`). |
| `config.devices` | `object[]` | (Optional) An array of predefined device configurations. |
| `config.logLevel` | `string` | (Optional) The logging level for the console output (`'none'`, `'error'`, `'warn'`, `'info'`, `'debug'`). Default: `'none'`. |

**Example:**

```javascript
import { XiaomiMiHome } from 'xmihome';

const miHome = new XiaomiMiHome({
  credentials: {
    username: 'your-email@example.com',
    password: 'your-password',
    country: 'sg'
  },
  logLevel: 'info'
});
```

## Methods

### `getDevices(options)`

Discovers available devices based on the specified strategy.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `options` | `object` | (Optional) Discovery options. |
| `options.timeout` | `number` | (Optional) Timeout for local (MiIO/Bluetooth) discovery in milliseconds. Default: `10000`. |
| `options.connectionType` | `string` | (Optional) The discovery method to use (`'cloud'`, `'miio'`, `'bluetooth'`). Overrides the default from the constructor. |
| `options.onDeviceFound` | `function` | (Optional) A callback function to filter and control the discovery process. It receives `(device, devices, type)` and can return `true` to include, `false` to skip, or an object `{ include?: boolean, stop?: boolean }` to control the flow. |


**Returns:**

- `Promise<object[]>`: A promise that resolves to an array of found device configurations.

### `getDevice(deviceConfig)`

Creates or retrieves a cached `Device` instance for a specific device.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `deviceConfig` | `object` | The configuration of the device to get (must contain `id`, `address`, or `mac`). |

**Returns:**

- `Promise<Device>`: A promise that resolves to a `Device` instance.

### `destroy()`

Releases all resources used by the client, including active connections and timers. It's important to call this method when the client is no longer needed to ensure a clean shutdown.

**Returns:**

- `Promise<void>`

### `getHome()`

Fetches the user's list of homes from the Xiaomi Cloud.

**Returns:**

- `Promise<object[]>`: A promise that resolves to an array of home objects.

### `getEnv(home_id)`

Fetches the environmental data for a specified home from the Xiaomi Cloud.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `home_id` | `number` | The ID of the home for which to fetch data. |

**Returns:**

- `Promise<object>`: A promise that resolves to an object with environmental data.

### `log(level, ...args)`

Writes a log message. It respects the `logLevel` set in the constructor and the `NODE_DEBUG=xmihome` environment variable.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `level` | `string` | The message level (`'error'`, `'warn'`, `'info'`, `'debug'`). |
| `...args` | `any` | Arguments to log, similar to `console.log`. |

**Returns:**

- `void`
