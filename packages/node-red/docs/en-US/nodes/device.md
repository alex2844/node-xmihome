<!-- markdownlint-disable-file MD041 -->
Allows interaction with a single, specific Xiaomi device:
get its status, send commands, and subscribe to notifications.

### Device Identification

The device can be specified in several ways:

1. **Node Config**: Device parameters are set manually in the node's
  configuration panel.
  - **Discovered Device**: You can select a device from the list
    automatically found by the `Devices` node. This is the easiest method.
  - **Manual**: You can enter the device parameters (ID, IP, MAC, token, model)
    manually. This is useful for devices that are not discovered automatically.
2. **`msg.device`**: The node will use the device object passed in
  the incoming `msg.device`. This allows for dynamic control of different
  devices with a single node.

**Important: The Model Field**

For correct operation, especially with Bluetooth devices, it is
**critically important** to specify the correct **Model**
(e.g., `deerma.humidifier.jsq2w`).

A correctly specified `Model` allows the node to use a dedicated class for
your device. These classes provide convenient, human-readable names for
properties (e.g., `fan_level` instead of `siid: 2, piid: 6`) and may also
offer additional methods (e.g., `getRooms()` for vacuums).

A full list of implemented device classes, their properties, actions, and
methods is available in the `xmihome-devices` package documentation:

- **[List of Supported Device Classes](https://github.com/alex2844/node-xmihome/blob/main/packages/devices/README.md)**

**What if my model is not on the list?**

Don't worry! If a specific class for your model is not found, the library
will automatically try to download its official MiOT specification from the
cloud. This works for most modern devices. In this case, you will be able to
control the device using the standard `siid` and `piid` for properties and
`siid` and `aiid` for actions.

### Actions

The node can perform various actions on the device:

- **Get Properties**: Requests *all* readable properties from the device and
  returns them as an object.
- **Get Property**: Requests the value of a single, specific property.
  The property name is set in the "Property" field or via `msg.property`.
- **Set Property**: Sets the value of a single property.
  - **Property**: The name of the property to change.
  - **Value**: The new value. Can be a string, number, boolean, or JSON object.
- **Call Action**: Calls a specific action on the device
  (e.g., `start_sweep` for a vacuum).
  - **Property**: The name of the action to call.
  - **Value**: The parameters for the action, typically an array (e.g., `[]`).
- **Call Method**: Calls a method directly on the device's class instance.
  This is for advanced use cases not covered by standard properties or
  actions (e.g., `getRooms` or `getMapImage` on a vacuum).
  - **Property**: The name of the method to call.
  - **Value**: The parameters for the method, as an array.
- **Subscribe to Property**: Subscribes to notifications for property changes.
  The node will send a message to the **first output** every time the device
  reports a new value. The connection to the device will be kept active.
- **Unsubscribe from Property**: Cancels a previously created subscription.
- **Subscribe to Advertisements**: Subscribes to Bluetooth LE advertisements
  (passive monitoring). Useful for battery-powered sensors that report data
  periodically without a persistent connection.
- **Unsubscribe from Advertisements**: Stops monitoring Bluetooth
  advertisements.

### Inputs

- `msg.device` (object, optional): If set, overrides the device
  configuration in the node.
- `msg.property` (string, optional): If set, overrides the property or
  action specified in the node.
- `msg.payload` (any): Used as the "Value" for the "Set Property" or
  "Call Action" action if the "Value" field in the node is configured
  to use `msg.payload`.
- `msg.topic` (string, optional): If set, overrides the topic for the
  outgoing message.

### Outputs

1. **Result / Notifications**
  - For `Get/Set/Call` actions: Sends a single message with the result of
    the operation. `msg.payload` contains the retrieved value, action
    result, or is an object `{property, value}` on a successful set.
  - For `Subscribe`: Sends a message each time a notification is received.
    `msg.payload` contains the new property value.
2. **Connection Events**
  - Sends messages about the device's connection status. Useful for
    debugging and monitoring.
  - `msg.payload.event` can be: `connected`, `disconnected`, `reconnecting`,
    `reconnect_failed`, `error`.
  - `msg.topic` will be structured like `connection/...` or `error/...`.
