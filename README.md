# lib IITC manager

Library for managing [IITC and plugins](https://iitc.app/).

## Getting started

```
npm install lib-iitc-manager --save
```

## Usage

Example code to use in WebExtension.
Imports the library, passes environment parameters and starts loading IITC and plugins.

```js
import { Manager } from 'lib-iitc-manager';

const manager = new Manager({
    storage: browser.storage.local,
    message: (message, args) => {
        console.log("Message for user:");
        console.log(message+", args: "+args);
    },
    progressbar: is_show => {
        if (is_show) {
            console.log("Show progress bar");
        } else {
            console.log("Hide progress bar");
        }
    },
    inject_plugin: plugin => {
        console.log("Code of UserScript plugin for embedding in a page:");
        console.log(plugin['code']);
    }
});

manager.run().then();
```

Example of use helpers:

```js
import { getUniqId } from "lib-iitc-manager";

const uniqId = getUniqId("tmp");
```

[See more in documentation](https://iitc-ce.github.io/lib-iitc-manager/)

## License

[GPL-3.0 license](/LICENSE)
