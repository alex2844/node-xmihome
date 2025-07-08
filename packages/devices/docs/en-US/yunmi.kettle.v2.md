# Mi Smart Kettle (yunmi.kettle.v2)

Class for managing the Mi Smart Kettle.

## Models

- `yunmi.kettle.v2`

## Aliases

- `MiKettle`

## Properties (Bluetooth)

| Name | Description | Access | Service / Characteristic (Short ID) |
|---|---|---|---|
| `authInit` | Authentication initialization characteristic. Used internally for secure connection. | - | `0023` / `002b` |
| `auth` | Authentication characteristic. Used internally for secure connection. | - | `0023` / `0024` |
| `keep_warm_settings` | Keep-warm mode settings. Allows setting the target temperature (40-90°C) and the heating type (`boil_and_cool_down` or `heat_to_temperature`). | `read`, `write` | `0038` / `0039` |
| `keep_warm_duration` | Duration of the keep-warm mode in hours. Accepts a value from 1 to 12. | `read`, `write` | `0038` / `0040` |
| `keep_warm_refill` | "Do not re-boil" mode. If `true`, the kettle will not re-boil the water if its temperature is above the target. | `read`, `write` | `0038` / `0043` |
| `status` | Kettle status. Returns an object with fields: `action`, `mode`, `keep_warm_set_temperature`, `current_temperature`, `keep_warm_type`, `keep_warm_time`. | `notify` | `0038` / `003c` |

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
