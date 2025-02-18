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

lib-iitc-manager is licensed under [GNU General Public License v3.0 (GPL-3.0)](/LICENSE).
For distribution through application stores (Apple App Store, Google Play Store, and others),
please refer to the [COPYING.STORE](/COPYING.STORE) file, which provides an exception for the application store
distribution requirements while maintaining GPL-3.0 compliance for the source code.


