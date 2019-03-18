const BeaconScanner = require('node-beacon-scanner');
const noble = require('@abandonware/noble');
const scanner = new BeaconScanner({'noble': noble});

/**
* CLEXI extension for Bluetooth LE beacon scanning. The input method uses msg.data.ctrl
* to control the extension (on/off etc.) and returns a confirmation string.
*/	
BleBeaconScanner = function(onStartCallback, onEventCallback, onErrorCallback){
	//Controls
	var doScan = false;
	
	//Set an Event handler for the Bluetooth service
	noble.on('stateChange', (state) => {
		if (state === "poweredOff"){
			stopScanning();
		}else if (state === "poweredOn"){
			if (doScan){
				startScanning();
			}
		}
	});

	//Set an Event handler for becons
	scanner.onadvertisement = (ad) => {
		//console.log(JSON.stringify(ad, null, '  '));
		if (onEventCallback) onEventCallback({
			data: {
				beacon: ad
			}
		});
	};

	//Start scanning
	function startScanning(msgId, socket){
		scanner.startScan().then(() => {
			if (onEventCallback){
				onEventCallback({
					data: {
						ctrl: "started"
					}
				});
			}
		}).catch((error) => {
			if (onErrorCallback) onErrorCallback({
				error: error
			});
		});
	}
	
	//Stop scanning
	function stopScanning(msgId, socket){
		scanner.stopScan();
		if (onEventCallback) onEventCallback({
			data: {
				ctrl: "stopped"
			}
		});
	}
	
	//Input
	this.input = function(msg, socket){
		//console.log(JSON.stringify(msg, null, '  '));
		var req = msg.data;
		//Start/Stop requests
		if (req){
			if (req.ctrl == "start"){
				startScanning(msg.id, socket);
				return "starting"; 		//will send an additional 'started' event later
				
			}else if (req.ctrl == "stop"){
				setTimeout(stopScanning, 300, msg.id, socket);		//... because this method has no promise ...
				return "stopping";		//will send an additional 'stopped' event later
			}
		}
		return "unknown request";
	}
	
	if (onStartCallback) onStartCallback({
		msg: "Bluetooth LE beacon scanner initialized."
	});
};

module.exports = BleBeaconScanner;