# ROIDMI EVE (roidmi.vacuum.v60)

Class for managing the ROIDMI EVE (roidmi.vacuum.v60) vacuum cleaner.

## Models

- `roidmi.vacuum.v60`

## Properties (MIoT)

| Name | Description | Access | siid / piid | Format |
|---|---|---|---|---|
| `status` | Operating status (2: Cleaning, 3: Paused, 4: Error, 5: Docking, 6: Charging). | `read`, `notify` | `2` / `1` | `uint8` |
| `fault` | Device error code. | `read`, `notify` | `2` / `2` | `uint8` |
| `mode` | Vacuum operating mode. | `read`, `write`, `notify` | `2` / `4` | `uint8` |
| `fan_level` | Suction power level (0: Quiet, 1: Standard, 2: Medium, 3: Turbo). | `read`, `write`, `notify` | `2` / `6` | `uint8` |
| `water_level` | Water supply level (101: Low, 102: Medium, 103: High). | `read`, `write`, `notify` | `2` / `7` | `uint8` |
| `mop_state` | State of the mop. | `read`, `notify` | `2` / `8` | `uint8` |
| `battery_level` | Battery charge level in percent. | `read`, `notify` | `3` / `1` | `uint8` |
| `charging_status` | Status of the charging process (1: Charging, 2: Not charging). | `read`, `notify` | `3` / `2` | `uint8` |

## Actions (MIoT)

| Name | Description | siid / aiid |
|---|---|---|
| `start_sweep` | Start cleaning. | `2` / `1` |
| `stop_sweep` | Stop/pause cleaning. | `2` / `2` |
| `start_charge` | Send to dock for charging. | `3` / `1` |
