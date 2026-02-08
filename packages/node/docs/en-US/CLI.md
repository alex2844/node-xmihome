# CLI

The `@xmihome/node` package includes command-line tools to manage your
Xiaomi devices.

## Commands

### `xmihome`

The main command for authentication and discovery.

#### `login`

This command allows you to interactively log in to the Xiaomi Cloud.
Successful authentication will save your credentials to a local file
(`~/.config/xmihome/credentials.json`) for future use.

**Usage:**

```bash
xmihome login [options]
```

**Options:**

- `-u, --username`: Your Xiaomi account username (email, phone, or ID).
- `-p, --password`: Your Xiaomi account password.
- `-c, --country`: The country code for your account (e.g., `ru`, `us`, `cn`).

#### `devices`

This command lists all your devices, discovering them from the local
network (miIO and Bluetooth) and/or the Xiaomi Cloud.

**Usage:**

```bash
xmihome devices [options]
```

**Options:**

- `--type`: Specifies the discovery type.
  - `all`: (Default) Discovers devices from all available sources.
  - `miio`: Discovers only miIO (Wi-Fi) devices on the local network.
  - `bluetooth`: Discovers only Bluetooth LE devices nearby.
  - `cloud`: Fetches the device list from the Xiaomi Cloud (requires login).
- `--force`: Forces a new discovery, ignoring any cached results.

### `xmihome-setup-bluetooth`

A utility to simplify Bluetooth configuration on Linux systems. It generates
D-Bus policy files to grant permissions and can set up a proxy for remote
Bluetooth access.

**Usage:**

```bash
xmihome-setup-bluetooth [options]
```

**Options:**

- `--remote`: Generate configuration for remote D-Bus access via TCP proxy.
- `--port`: Port for remote access (default: 55555).
- `--host`: Host to listen on (default: 0.0.0.0).
- `--help, -h`: Show help message.
