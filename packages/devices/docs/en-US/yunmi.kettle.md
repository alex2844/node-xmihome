# Mi Smart Kettle (yunmi.kettle.v2)

Class for managing the Mi Smart Kettle (yunmi.kettle.v2).

## Models

- `yunmi.kettle.v2`

## Aliases

- `MiKettle`

## Properties (Bluetooth)

| Name | Description | Access | Service / Characteristic (Short ID) |
|---|---|---|---|
| `authInit` | Authentication initialization characteristic. | - | `0023` / `002b` |
| `auth` | Authentication characteristic. | - | `0023` / `0024` |
| `keep_warm_settings` | Keep-warm mode settings. Allows setting the target temperature and heating type. | `read`, `write` | `0038` / `0039` |
| `keep_warm_duration` | Duration of the keep-warm mode in hours. Accepts a value from 1 to 12. | `read`, `write` | `0038` / `0040` |
| `keep_warm_refill` | "Do not re-boil" mode. | `read`, `write` | `0038` / `0043` |
| `status` | Kettle status. | `notify` | `0038` / `003c` |

## UUID Map

### Services

| UUID | Short ID |
|---|---|
| `0000fe95-0000-1000-8000-00805f9b34fb` | `0023` |
| `01344736-0000-1000-8000-262837236156` | `0038` |

### Characteristics

| UUID | Short ID |
|---|---|
| `00000010-0000-1000-8000-00805f9b34fb` | `002b` |
| `00000001-0000-1000-8000-00805f9b34fb` | `0024` |
| `0000aa01-0000-1000-8000-00805f9b34fb` | `0039` |
| `0000aa04-0000-1000-8000-00805f9b34fb` | `0040` |
| `0000aa05-0000-1000-8000-00805f9b34fb` | `0043` |
| `0000aa02-0000-1000-8000-00805f9b34fb` | `003c` |
