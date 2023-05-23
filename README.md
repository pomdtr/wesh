# Popcorn

An integrated terminal for your browser.

![screenshot](./static/screenshot.png)

## Installation

> **Warning**: Popcorn does not work on Windows yet (see [this issue](https://github.com/creack/pty/issues/161)).

```bash
# clone the repository
git clone https://github.com/pomdtr/popcorn && cd popcorn

# install the cli
go install

# build the extension
cd extension
npm i
npm run build
```

Then go to the `chrome://extensions` page, activate the Developer mode and click on the `Load unpacked` button.
You will need to select the `extension/dist` folder using the file picker.

![Extension Page](./static/extensions.png)

Once you have installed the extension, copy the extension id, and run the following command:

```bash
popcorn init --browser chrome --extension-id <extension-id>
```

## How does it work?

Popcorn is composed of two parts:

- A CLI that will create a configuration file and a binary that will be used by the extension.
- A Chrome extension that will communicate with the binary and display the terminal.

When the chrome extension is loaded, it will use the native messaging API to communicate with the host binary.
An instance of an HTTP server will be started on the 9999 port.

When the popup is opened, the embedded terminal (xterm.js) will connect to the HTTP server and will be able to send and receive data through a websocket.

When you use the popcorn cli, the message is sent to the http server, and then piped to the chrome extension.

![popcorn architecture](./static/architecture.excalidraw.png)
