# ROIDMI EVE

Class for managing the ROIDMI EVE vacuum cleaner.

## Models

- `roidmi.vacuum.v60`

## Properties (MIoT)

| Name            | Description                       | Access                 | siid / piid | Format |
| --------------- | --------------------------------- | ---------------------- | ----------- | ------ |
| `status`        | Operating status.                 | `read`, `notify`       | `2` / `1`   | `uint8` |
| `fault`         | Device error code.                | `read`, `notify`       | `2` / `2`   | `uint8` |
| `mode`          | Suction power level.              | `read`, `write`, `notify` | `2` / `4`   | `uint8` |
| `sweep_type`    | Type of cleaning.                 | `read`, `notify`       | `2` / `8`   | `uint8` |
| `battery_level` | Battery charge level in percent.  | `read`, `notify`       | `3` / `1`   | `uint8` |
| `charging_status` | Status of the charging process. | `read`, `notify`       | `3` / `2`   | `uint8` |
| `water_level`   | Water supply level.               | `read`, `write`, `notify` | `8` / `11`  | `uint8` |

## Actions (MIoT)

| Name               | Description                     | siid / aiid |
| ------------------ | ------------------------------- | ----------- |
| `start_sweep`      | Start cleaning.                 | `2` / `1`   |
| `stop_sweep`       | Stop/pause cleaning.            | `2` / `2`   |
| `start_charge`     | Send to dock for charging.      | `3` / `1`   |
| `start_room_sweep` | Start cleaning specific rooms.  | `14` / `1`  |

## Methods

The device class provides additional methods for advanced interactions, such
as retrieving map data.

| Name          | Description                                                    | Returns                                                          |
| ------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| `getRooms()`  | Gets a list of rooms and the map ID from the map metadata.     | `Promise<{mapId: number, segments: {id: number, name: string}[]}>` |
| `getMapImage()` | Generates an SVG image of the map.                           | `Promise<string>`                                                |

## Constants

The device uses the following constant values, which can be seen in the
output of properties.

### Operating Status (`status`)

| Value | Description           |
| ----- | --------------------- |
| `1`   | Dormant               |
| `2`   | Idle                  |
| `3`   | Paused                |
| `4`   | Sweeping              |
| `5`   | Go Charging           |
| `6`   | Charging              |
| `7`   | Error                 |
| `8`   | Remote Control        |
| `9`   | Full Charge           |
| `10`  | Shutdown              |
| `11`  | Find Charger Paused   |

### Fault Codes (`fault`)

| Value | Description                                  |
| ----- | -------------------------------------------- |
| `0`   | No Faults                                    |
| `1`   | Low Battery, returning to charger            |
| `2`   | Low Battery and Powering Off                 |
| `3`   | Wheel trapped                                |
| `4`   | Collision sensor error                       |
| `5`   | Device tilted                                |
| `6`   | Lidar blocked                                |
| `7`   | Front collision sensor dirty                 |
| `8`   | Side wall sensor dirty                       |
| `9`   | Main brush trapped                           |
| `10`  | Side brush trapped                           |
| `11`  | Fan speed error                              |
| `12`  | Lidar cover trapped                          |
| `13`  | Dustbin full, please clean                   |
| `14`  | Dustbin removed                              |
| `15`  | Dustbin full (while removed)                 |
| `16`  | Device trapped                               |
| `17`  | Device lifted, place on ground to start      |
| `18`  | Water tank removed                           |
| `19`  | Insufficient water                           |
| `20`  | Designated area unreachable                  |
| `21`  | Cannot start from forbidden zone             |
| `22`  | Cliff sensor detected, move away to start    |
| `23`  | Water pump current error                     |
| `24`  | Failed to return to charger                  |
| `25`  | Low power clean, water pump open circuit     |

### Suction Power (`mode`)

| Value | Description |
| ----- | ----------- |
| `0`   | Off         |
| `1`   | Silent      |
| `2`   | Basic       |
| `3`   | Strong      |
| `4`   | Full Speed  |

### Sweep Type (`sweep_type`)

| Value | Description     |
| ----- | --------------- |
| `0`   | Sweep           |
| `1`   | Mop             |
| `2`   | Mop and Sweep   |

### Charging Status (`charging_status`)

| Value | Description     |
| ----- | --------------- |
| `1`   | Charging        |
| `2`   | Not charging    |
| `3`   | Not chargeable  |

### Water Level (`water_level`)

| Value | Description |
| ----- | ----------- |
| `0`   | Off         |
| `1`   | Low         |
| `2`   | Medium      |
| `3`   | High        |
| `4`   | Maximum     |
