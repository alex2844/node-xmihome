<!-- markdownlint-disable-file MD041 -->
Configures the connection to your Xiaomi Mi Home account to access
devices via the cloud, local network (MiIO), or Bluetooth.

### Configuration

#### Authentication (for Cloud)

- **Username**: Your Xiaomi account login (Email, phone, or account ID).
- **Password**: Your Xiaomi account password.
- **Country**: The server region your account is bound to. **It is crucial to
select the correct region**, otherwise, your devices will not be found in the cloud.
Available regions:
`ru` (Russia), `cn` (China), `de` (Germany), `us` (USA), `sg` (Singapore), `tw` (Taiwan).

This information is **only** required for fetching the device list from the cloud
or for controlling devices in "Cloud" mode. If you plan to use only local control
(MiIO/Bluetooth) with manually entered parameters, you can leave these fields blank.

#### Defaults

- **Default mode**: Specifies the default connection method to be used for
all devices if a specific mode is not selected in the `Device` node.
  - **Auto**: The library will attempt to determine the best connection method
  based on the provided device data
  (IP and token for MiIO, MAC for Bluetooth, ID for Cloud).
  - **Cloud**: Forces the use of the Xiaomi Cloud API.
  Requires authentication to be configured.
  - **MiIO**: Forces the use of the local MiIO protocol.
  Requires the device's IP address and token.
  - **Bluetooth**: Forces the use of Bluetooth LE.
  Requires the device's MAC address and model.

#### Debugging

- **Enable debug**: Activates detailed logging of the library's operations
in the Node-RED debug panel. Useful for diagnosing issues.

