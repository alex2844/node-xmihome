# node-xmihome

[[RU]](./ru/README.md) | [EN]

This is a monorepo for `node-xmihome` — a set of tools for controlling
Xiaomi Mi Home devices using Node.js. The project provides both a core
library for developers and a ready-to-use integration for Node-RED.

## Repository Structure

This repository contains several packages located in the `packages/` directory:

| Package                                           | NPM                                                                                                                     | Description                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`xmihome`](../packages/node/)                    | [![npm](https://img.shields.io/npm/v/xmihome.svg)](https://www.npmjs.com/package/xmihome)                                  | The core library for interacting with Xiaomi devices via Cloud, MiIO, and Bluetooth.     |
| [`node-red-contrib-xmihome`](../packages/node-red/) | [![npm](https://img.shields.io/npm/v/node-red-contrib-xmihome.svg)](https://www.npmjs.com/package/node-red-contrib-xmihome) | A set of nodes for easy integration of `xmihome` into Node-RED projects.             |
| [`xmihome-devices`](../packages/devices/)         | [![npm](https://img.shields.io/npm/v/xmihome-devices.svg)](https://www.npmjs.com/package/xmihome-devices)                  | Definitions and specifications for specific device models.                               |
| [`xmihome-web`](../packages/web/)                 | (Private)                                                                                                               | A demo web application for controlling devices via Web Bluetooth.                        |

## Development Setup

To work with this monorepo, you will need to install [Bun](https://bun.sh/),
as it correctly handles the workspace dependencies for this project.

1. **Clone the repository:**

    ```bash
    git clone https://github.com/alex2844/node-xmihome.git
    cd node-xmihome
    ```

2. **Install dependencies:**
    This command will install dependencies for all packages and create the
    necessary symlinks between them.

    ```bash
    bun install
    ```

3. **Build packages:**
    If any package requires a build step (e.g., `node-red-contrib-xmihome`),
    you can build all packages at once using:

    ```bash
    bun run build
    ```

4. **Type checking:**
    To check the code with TypeScript, run:

    ```bash
    bun run test
    ```
