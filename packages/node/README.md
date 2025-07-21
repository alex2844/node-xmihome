# xmihome

[[RU]](./docs/ru/README.md) | [EN]

**A Node.js library for controlling Xiaomi Mi Home devices.**

`xmihome` provides a simple and convenient interface for interacting with various
Xiaomi Mi Home smart devices through Node.js. The library supports multiple
connection types, including MiIO, Bluetooth, and the Xiaomi cloud, allowing you
to integrate Xiaomi devices into your Node.js applications.

This package is the core dependency for [`node-red-contrib-xmihome`](https://www.npmjs.com/package/node-red-contrib-xmihome).

## Features

* **Multiple Connection Types:**
  * **MiIO:** Direct local control via the MiIO protocol (token + IP address).
  * **Bluetooth:** Control Bluetooth LE devices (MAC address + model).
  * **Xiaomi Cloud:** Control via the Xiaomi cloud (login/password + device ID).
* **Automatic Connection Type Detection:** The library automatically determines
the connection type for an *individual* device based on the provided configuration data.
* **Customizable Device Discovery:**
  * Get a list of devices from the Xiaomi cloud.
  * Scan for MiIO devices on the local network.
  * Scan for Bluetooth LE devices.
* **Dynamic Device Support and Extensibility:**
  * The library can interact with **most Xiaomi Mi Home devices**, even if
  there is no specific definition file for them.
  * Definition files provide **optimized support** for specific models, including
  user-friendly property names and specific logic.
  * Easily add support for new devices.
* **Bluetooth LE Support on Linux:** Includes automatic installation of
`dbus-next` and generation of a configuration file to resolve Bluetooth permission issues.

## Installation

```bash
npm install xmihome
```

**Important for Linux users with Bluetooth:**

During installation, the library will automatically check for a Bluetooth adapter and
install `dbus-next` if necessary.

If you are not a root user, a Bluetooth configuration file `xmihome_bluetooth.conf`
will be created in the `node_modules/xmihome/` directory during installation.

For Bluetooth LE functions to work correctly, you may need to copy this file
to the system's D-Bus directory and restart the service:

```bash
sudo cp node_modules/xmihome/xmihome_bluetooth.conf /etc/dbus-1/system.d/
sudo systemctl restart bluetooth
```

## Usage

```javascript
import { XiaomiMiHome } from 'xmihome';

async function main() {
  const miHome = new XiaomiMiHome({
    credentials: {
      username: process.env.XIAOMI_USERNAME,
      password: process.env.XIAOMI_PASSWORD,
      country: 'sg'
    },
    connectionType: 'cloud',
    logLevel: 'error'
  });

  try {
    const devices = await miHome.getDevices({
      timeout: 30000,
      onDeviceFound: (device, devices, type) => {
        // Return true to include the device, false to ignore, or
        // an object { include?: boolean, stop?: boolean } to control the discovery.
        return true;
      }
    });
    console.log('Found devices:', devices);

    if (devices.length === 0)
      throw new Error('Device not found');

    // Select a device to control
    const device = await miHome.getDevice(devices[0]);

    // Connect to the device (connection type will be determined automatically)
    await device.connect();
    console.log(`Connected to device "${device.getName()}" via: ${device.connectionType}`);

    // Get the current properties of the device
    const properties = await device.getProperties();
    console.log('Current properties:', properties);

    // Set a new property value
    if (!properties.on) {
      await device.setProperty('on', true);
      console.log('Device turned on');
    }

    // Disconnect from the device
    await device.disconnect();
    console.log('Disconnected from device');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Release resources
    miHome.destroy();
  }
}

main();
```

## Configuration

The configuration object passed to the `XiaomiMiHome` constructor can contain:

* **`credentials`:**
Xiaomi cloud connection credentials.
  * `username` (string): Xiaomi account username.
  * `password` (string): Xiaomi account password.
  * `country` (string): Xiaomi account region (e.g., 'ru', 'cn', 'us').
* **`devices` (array of objects):**
An array of objects with device information. Used to provide static information
about devices or to specify tokens for MiIO devices.
  * `id` (string): Device ID in the Xiaomi cloud (for cloud connection).
  * `address` (string): Device IP address (for MiIO connection).
  * `token` (string): Device token (for MiIO connection).
  * `mac` (string): Device MAC address (for Bluetooth connection).
  * `model` (string): Device model (e.g., 'deerma.humidifier.jsq2w').
  * `name` (string, optional): Device name (for convenience).
* **`connectionType` (string):** Defines the **device discovery method** when
calling `getDevices()` and the **default connection type** when calling
`device.connect()` without explicitly specifying a type.
  * **When calling `getDevices()`:**
    * `'cloud'`: Search for devices only in the Xiaomi cloud (requires `credentials`).
    * `'miio'`: Search for devices only via MiIO on the local network.
    * `'bluetooth'`: Search for devices only via Bluetooth.
    * *Not specified (default):* If `credentials` are present, searches in the cloud.
    If `credentials` are not present, performs a combined MiIO + Bluetooth search.
  * **When calling `device.connect()` without an argument:** Used as the preferred
  connection type if it matches the device data (e.g., if `connectionType: 'miio'`,
  the device must have `address` and `token`).
* **`logLevel`**:
Logging level (`'none'`, `'error'`, `'warn'`, `'info'`, `'debug'`).

## API Reference

For detailed information about classes and methods, see the full API documentation:

* [**XiaomiMiHome**](./docs/en-US/api/XiaomiMiHome.md) - The main class for managing connections and devices.
* [**Device**](./docs/en-US/api/Device.md) - The base class for all devices, providing methods for connecting, getting/setting properties, etc.
* [**Miot**](./docs/en-US/api/Miot.md) - The class for working with Cloud and MiIO protocols.
* [**Bluetooth**](./docs/en-US/api/Bluetooth.md) - The class for working with Bluetooth LE at a low level.

## How to Add Support for New Devices

If your Xiaomi Mi Home device is not on the list of devices with optimized support,
you can still try to control it using `xmihome`.

To **improve support** and add user-friendly property names for your device, you can:

1. **Investigate your device's specification:** Look for information about the MiIO
protocol or Bluetooth GATT services and characteristics that your device uses.
[Miot-spec.org](https://miot-spec.org/) can be a useful resource.
2. **Create a device definition file:** Create a new `.js` file in the
[`packages/devices/src/devices/`](../devices/src/devices) directory,
based on the example of existing files (e.g., `deerma.humidifier.jsq2w.js`).
3. **Define static properties:** Fill in `static name`, `static models`,
`static properties`, and `static actions` according to your device's specification.
4. **Submit a Pull Request:** If you want to share your work with the community,
submit a Pull Request to the `xmihome` GitHub repository with your device
definition file.

## Logging

The library supports two logging methods:

1. **Environment variable `NODE_DEBUG=xmihome`** for detailed output via `util.debuglog`.
2. **Constructor option `logLevel`** for output to the `console`.
