# node-xmihome

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[[RU]](./docs/ru/README.md) | [EN]

This is a monorepo for `node-xmihome` — a set of tools for controlling
Xiaomi Mi Home devices using Node.js. The project provides both a core
library for developers and a ready-to-use integration for Node-RED.

## Repository Structure

This repository contains several packages located in the `packages/` directory:

| Package | NPM | Description |
| --- | --- | --- |
| [`xmihome`](./packages/node/) | [![npm](https://img.shields.io/npm/v/xmihome.svg)](https://www.npmjs.com/package/xmihome) | The core library for interacting with Xiaomi devices via Cloud, MiIO, and Bluetooth. |
| [`node-red-contrib-xmihome`](./packages/node-red/) | [![npm](https://img.shields.io/npm/v/node-red-contrib-xmihome.svg)](https://www.npmjs.com/package/node-red-contrib-xmihome) | A set of nodes for easy integration of `xmihome` into Node-RED projects. |
| [`xmihome-devices`](./packages/devices/) | (Private) | Definitions and specifications for specific device models. |
| [`xmihome-web`](./packages/web/) | (Private) | A demo web application for controlling devices via Web Bluetooth. |

## Development

To get started with this repository, you will need Node.js and npm (or bun).

1. **Clone the repository:**

    ```bash
    git clone https://github.com/alex2844/node-xmihome.git
    cd node-xmihome
    ```

2. **Install dependencies:**
    This command will install dependencies for all packages and create
    symlinks between them.

    ```bash
    bun install
    ```

3. **Build packages:**
    If any package requires a build step
    (e.g., `node-red-contrib-xmihome`), run the command:

    ```bash
    npm run build
    ```

4. **Type checking:**
    To check the code with TypeScript, run:

    ```bash
    npm test
    ```
