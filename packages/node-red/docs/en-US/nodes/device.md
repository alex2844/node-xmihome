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
the incoming `msg.device`.
This allows for dynamic control of different devices with a single node.

**Important:** For correct operation, especially with Bluetooth devices,
it is **critically important** to specify the correct **Model**.

### Actions

The node can perform various actions on the device:

- **Get Properties**: Requests *all* readable properties
from the device and returns them as an object.
- **Get Property**: Requests the value of a single, specific property.
The property name is set in the "Property" field or via `msg.property`.
- **Set Property**: Sets the value of a single property.
  - **Property**: The name of the property to change.
  - **Value**: The new value. Can be a string, number, boolean, or JSON object.
- **Subscribe to Property**: Subscribes to notifications for property changes.
The node will send a message to the **first output** every time the device
reports a new value. The connection to the device will be kept active.
- **Unsubscribe from Property**: Cancels a previously created subscription.

### Inputs

- `msg.device` (object, optional): If set,
overrides the device configuration in the node.
- `msg.property` (string, optional): If set,
overrides the property specified in the node.
- `msg.payload` (any): Used as the "Value" for the "Set Property" action
if the "Value" field in the node is configured to use `msg.payload`.
- `msg.topic` (string, optional): If set, overrides the topic for the outgoing message.

### Outputs

1. **Result / Notifications**
    - For `Get/Set` actions: Sends a single message with the result of the operation.
    `msg.payload` contains the retrieved value or
    is `undefined` on a successful set.
    - For `Subscribe`: Sends a message each time a notification is received.
    `msg.payload` contains the new property value.
2. **Connection Events**
    - Sends messages about the device's connection status.
    Useful for debugging and monitoring.
    - `msg.payload.event` can be:
    `connected`, `disconnected`, `reconnecting`, `reconnect_failed`, `error`.
    - `msg.topic` will be structured like `connection/...` or `error/...`.

