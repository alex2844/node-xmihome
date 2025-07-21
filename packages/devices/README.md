# xmihome-devices

[[RU]](./docs/ru/README.md) | [EN]

This package contains definitions and classes for specific Xiaomi Mi Home device
models, allowing them to be controlled via the `xmihome` core library.

## Supported Devices

Below is a list of supported devices, categorized by their connection type.

### MIoT Devices

These devices are controlled via the MIoT (Xiaomi IoT) protocol,
which typically uses a cloud-based or local network connection.

| Device Name | Models | Documentation |
| --- | --- | --- |
| Xiaomi Smart Humidifier 2 | `deerma.humidifier.jsq2w` | [View](./docs/en-US/deerma.humidifier.jsq2w.md) |
| ROIDMI EVE | `roidmi.vacuum.v60` | [View](./docs/en-US/roidmi.vacuum.md) |

### Bluetooth Devices

These devices are controlled directly via Bluetooth Low Energy (BLE).

| Device Name | Models | Documentation |
| --- | --- | --- |
| Temperature Humidity Sensor | `miaomiaoce.sensor_ht.t8` | [View](./docs/en-US/miaomiaoce.sensor_ht.t8.md) |
| Xiaomi Body Composition Scale | `xiaomi.scales.ms115` | [View](./docs/en-US/xiaomi.scales.md) |
| Mi Smart Kettle | `yunmi.kettle.v2` | [View](./docs/en-US/yunmi.kettle.md) |
