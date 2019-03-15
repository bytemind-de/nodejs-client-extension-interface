const BeaconScanner = require('node-beacon-scanner');
const noble = require('@abandonware/noble');
const scanner = new BeaconScanner({'noble': noble});

// Set an Event handler for the Bluetooth service
noble.on('stateChange', (state) => {
  if (state === "poweredOff") {
    scanner.stopScan()
  } else if (state === "poweredOn") {
    scanner.startScan()
  }
});

// Set an Event handler for becons
scanner.onadvertisement = (ad) => {
  console.log(JSON.stringify(ad, null, '  '));
};

// Start scanning
scanner.startScan().then(() => {
  console.log('Started to scan.')  ;
}).catch((error) => {
  console.error(error);
});

