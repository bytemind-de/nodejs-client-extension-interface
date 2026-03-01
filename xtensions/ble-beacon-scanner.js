const BeaconScanner = require('node-beacon-scanner');
//const { withBindings: nobleWithBindings } = require('@stoprocent/noble');

/**
* CLEXI extension for Bluetooth LE beacon scanning. The input method uses msg.data.ctrl
* to control the extension (on/off etc.) and returns a confirmation string.
*/	
BleBeaconScanner = function(onStartCallback, onEventCallback, onErrorCallback){
	//Controls
	//var autoResume = false;		//TBD
	var isScanning = false;
	
	//const scanner = new BeaconScanner({'noble': noble});
	const scanner = new BeaconScanner(/* TBD */);
	
	//Set error handler for the Bluetooth service
	scanner.onerror = (err) => {
		/*if (err.name == "AdapterStateError"){
			//TBD
			//autoResume ... ?
		}*/
		if (onErrorCallback) onErrorCallback({
			error: {
				name: (err.name || "UndefinedScannerError"),
				msg: (err.message || "unknown"),
				code: 500
			}
		});
		try {
			stopScanning();
		} catch (err) {
			isScanning = false;
		}
		try {
			scanner.destroyInstance();
		} catch (err) {}
	}
	//scanner.ondebug = (msg) => { console.log("BleBeaconScanner debug - " + msg); };
	
	//TODO: add releaseAll function?

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
			}).catch((err) => {
				isScanning = false;
				if (onErrorCallback) onErrorCallback({
					error: {
						name: (err.name || "UndefinedScannerError"),
						msg: (err.message || "unknown"),
						code: 500,
						msgId: msgId
					}
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