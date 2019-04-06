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
	var isScanning = false;
	
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

	//Set an Event handler for beacons
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
		if (!isScanning){
			scanner.startScan().then(() => {
				isScanning = true;
				if (onEventCallback){
					onEventCallback({
						data: {
							ctrl: "started"
						}
					});
				}
			}).catch((error) => {
				isScanning = false;
				if (onErrorCallback) onErrorCallback({
					error: error
				});
			});
		}
	}
	
	//Stop scanning
	function stopScanning(msgId, socket){
		scanner.stopScan();
		isScanning = false;
		if (onEventCallback) onEventCallback({
			data: {
				ctrl: "stopped"
			}
		});
	}
	
	//Get scanner state
	function getScannerState(){
		return ((isScanning)? {state:"on"} : {state:"off"});
	}
	
	//Input
	this.input = function(msg, socket){
		//console.log(JSON.stringify(msg, null, '  '));
		var req = msg.data;
		//Start/Stop requests
		if (req){
			if (req.ctrl == "start"){
				if (!isScanning){
					startScanning(msg.id, socket);
					return {action:"starting"};		//will send an additional 'started' event later
				}else{
					return {action:"no change"};
				}
				
			}else if (req.ctrl == "stop"){
				setTimeout(stopScanning, 300, msg.id, socket);		//... because this method has no promise ...
				return {action:"stopping"};		//will send an additional 'stopped' event later
			
			}else if (req.ctrl == "state"){
				return getScannerState();		//direct answer
			}
		}
		return "unknown request";
	}
	
	if (onStartCallback) onStartCallback({
		msg: "Bluetooth LE beacon scanner initialized."
	});
};

module.exports = BleBeaconScanner;