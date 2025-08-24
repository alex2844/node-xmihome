# CLI

The `@xmihome/node` package includes a command-line interface (CLI)
to manage your Xiaomi devices. It helps with authentication and device
discovery.

## Commands

The CLI supports two main commands: `login` and `devices`.

### `login`

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

If you run the command without options, it will prompt you to enter them
interactively. The CLI also supports two-factor authentication (2FA) by
asking you to input a code sent to your device.

### `devices`

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
- `--force`: Forces a new discovery, ignoring any cached results. The CLI
    caches device lists to speed up subsequent calls.

**Global Options:**

- `--verbose`: Runs the command with detailed logging, which is useful for
    debugging.
- `-h, --help`: Shows the help message.
- `-v, --version`: Shows the package version.
