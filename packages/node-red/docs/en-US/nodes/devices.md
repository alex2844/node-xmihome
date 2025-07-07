<!-- markdownlint-disable-file MD041 -->
Retrieves a list of devices available through the selected configuration node.

This node initiates the device discovery process and returns an array
of found devices in `msg.payload`.

### Properties

- **Config**: Select a previously configured `xmihome-config` node.
- **Discovery Timeout**: The maximum time in milliseconds to spend searching
for devices on the local network (MiIO and Bluetooth).
Cloud discovery is not affected by this timeout.
The default is 10000 ms (10 seconds).

### Inputs

Any incoming message (`msg`) will trigger the discovery process.
The content of the `msg` is ignored.

### Outputs

- `msg.payload` (array): An array of objects, where each object represents
a single discovered device. The object structure typically includes:
  - `id`: Device ID (DID)
  - `name`: Device Name
  - `model`: Device Model (e.g., `deerma.humidifier.jsq2w`)
  - `address`: Local IP address (for MiIO devices)
  - `mac`: MAC address (for Bluetooth devices)
  - `token`: Token for local control (if available)
  - `isOnline`: Device status in the cloud (if discovered via cloud)

### Usage Example

Connect an `Inject` node to this node to trigger discovery on-demand.
Connect a `Debug` node to the output to see the list of found devices.
This list can be used to dynamically configure the `Device` node.

