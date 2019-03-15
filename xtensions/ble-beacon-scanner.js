const BeaconScanner = require('node-beacon-scanner');
const noble = require('@abandonware/noble');
const scanner = new BeaconScanner({'noble': noble});
	
BleBeaconScanner = function(onStartCallback, onEventCallback, onErrorCallback){
	//Set an Event handler for the Bluetooth service
	noble.on('stateChange', (state) => {
		if (state === "poweredOff"){
			scanner.stopScan();
		}else if (state === "poweredOn"){
			scanner.startScan();
		}
	});

	//Set an Event handler for becons
	scanner.onadvertisement = (ad) => {
		//console.log(JSON.stringify(ad, null, '  '));
		if (onEventCallback) onEventCallback({
			type: "ble-beacon-scanner",
			data: ad
		});
	};

	//Start scanning
	scanner.startScan().then(() => {
		if (onStartCallback) onStartCallback({
			type: "ble-beacon-scanner",
			msg: "Scanning for BLE beacons."
		});
	}).catch((error) => {
		if (onErrorCallback) onErrorCallback({
			type: "ble-beacon-scanner",
			error: error
		});
	});
	
	//Input
	this.input = function(msg){
		//TODO: implement start stop?
		console.log(JSON.stringify(msg, null, '  '));
		return "got it";
	}
};

module.exports = BleBeaconScanner;