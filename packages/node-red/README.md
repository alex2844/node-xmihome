# node-red-contrib-xmihome

[[RU]](./docs/ru/README.md) | [EN]

A set of [Node-RED](https://nodered.org/) nodes for controlling
[Xiaomi Mi Home](https://home.mi.com/) devices using the
[`xmihome`](https://www.npmjs.com/package/xmihome) library.

These nodes allow you to discover and control devices via the Xiaomi cloud,
the local network (MiIO protocol), or Bluetooth LE.

## Features

- **Three connection methods:** Cloud, MiIO (local), and Bluetooth LE.
- **Automatic discovery:** Finds devices in the cloud and on your local
  network.
- **Simple control:** Get/set device properties (on/off, temp, etc.) and
  call actions.
- **Event subscription:** Receive real-time updates from devices.
- **Full localization:** Interface available in Russian and English.
- **Detailed help:** Built-in documentation for each node in the
  Node-RED "Help" panel.

## Installation

Install via the Node-RED Manage Palette or run the following command in
your Node-RED user directory:

```bash
npm install node-red-contrib-xmihome
```

**Note for Linux users with Bluetooth:** The package will attempt to
automatically configure D-Bus permissions. If you encounter issues, please
refer to the
[instructions in the core library](https://github.com/alex2844/node-xmihome/tree/main/packages/node#installation).

## Nodes

- **`xmihome-config` (Configuration):** Configures your Xiaomi
  credentials and default connection settings.
- **`xmihome-devices` (Discovery):** Initiates the discovery process and
  returns a list of found devices.
- **`xmihome-device` (Control):** Interacts with a single device to
  get/set properties, call actions, or subscribe to notifications.
