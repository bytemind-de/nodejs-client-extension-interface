//might be required (change group 'gpio' as you like):
//- sudo su -c "echo 'SUBSYSTEMS==\"usb\", ATTRS{idVendor}==\"2886\", ATTRS{idProduct}==\"0018\", GROUP=\"gpio\", MODE=\"0666\"' > /etc/udev/rules.d/99-ReSpeakerUSB.rules"
//- sudo usermod -a -G gpio $USER
//- reboot or replug USB device
const USB = require('usb');
//const BMRT = require('bmrequesttype');

/*
Required interface functions:
- description(): Info about the item options and commands
- Class:
  - constructor(options)
  - init(successCallback, errorCallback)
  - writeData(data, successCallback, errorCallback)
  - readData(options, successCallback, errorCallback)
  - release(successCallback, errorCallback)
- test(options): Function to test item (init, write, read, release)
*/

function description(){
	return {
		type: "ledArrayUsb",
		options: [
			{name: "mode", type: "string", values: ["sepia", "seeed"]},
			{name: "brightness", type: "number", min: 1, max: 31}
		],
		writeInterface: [
			{name: "state", type: "string", values: [
				"idle", "loading", "listening", "speaking", "awaitDialog", "wakeWordActive", "wakeWordInactive"]},
			{name: "rgb0Array", type: "array"}
		],
		info: "ReSpeaker Mic Array v2.0 USB LED interface."
	};
}

class PixelRing {
    constructor(device, mode) {
        this.device = device;
		this.mode = mode;
		this.state = "";
		this.vadState = "";
		
		//init. LED buffer
		this._numOfLeds = 12;
		this._ledBits = this._numOfLeds * 4;		//rgb0
		this.ledArray = new Array(this._ledBits);	//full LEDs configuration
		this.ledArray.fill(0);
		
		//set LED array
		this.setLedArray = function(ledIndex, rgbRed, rgbGreen, rgbBlue, brightness){
			let currentLed = (ledIndex - 1) * 4;
			this.ledArray[currentLed + 0] = rgbRed;
			this.ledArray[currentLed + 1] = rgbGreen;
			this.ledArray[currentLed + 2] = rgbBlue;
			this.ledArray[currentLed + 3] = brightness;
		}
		//set array for all LEDs
		this.setLedArrayAll = function(red, green, blue, brightness){
			for (let i=0; i < this._numOfLeds; i++) {
				this.setLedArray(i, red, green, blue, brightness);
			}
		}
    }
	
	get availableStates() {
		return ["idle", "loading", "listening", "speaking", "awaitDialog", "wakeWordActive", "wakeWordInactive", "custom"];
	}
	get currentState() {
		return {state: this.state, vad: this.vadState};
	}

    write(cmd, data, stateInfo) {
        if (data == undefined) data = [0];
        const buffer = Buffer.from(data);
        //var bmRt = BMRT.bmRequestType(BMRT.DIRECTION.Out, BMRT.TYPE.Vendor, BMRT.RECIPIENT.Device);
		var bmRt = 0x40;
		var that = this;
		return new Promise(function(resolve, reject){
			that.device.controlTransfer(bmRt, 0, cmd, 0x1C, buffer, function(err, data){
				if (err){
					reject(err);
				}else{
					if (stateInfo) that.state = stateInfo;
					resolve(data);
				}
			});
		});
    }
	
	//settings
	traceMode() {
		return this.write(0, [0], "trace");
	}
	vadLedMode(i) {
		this.vadState = i;		//TODO: unchecked state
		return this.write(0x22, [i]);	//0 - off, 1 - on, 3 - auto
	}
	brightness(i) {
		return this.write(0x20, [i]);	//range: 0x00 to 0x1F - or 0 to 31
	}

	//states
	custom(rgb0Array, stateInfo) {
        return this.write(6, rgb0Array, stateInfo); 	//TODO
    }
    idle() {
        return this.write(1, [0, 0, 0, 0], "idle");
    }
    loading() {
        return this.write(5, [0], "loading");
    }
	listening() {
        return this.write(2, [0], "listening");
    }
	speaking() {
        return this.write(4, [0], "speaking");
    }
	awaitDialog() {
		this.setLedArray(1, 120, 120, 0, 0);
        return this.custom(this.ledArray, "awaitDialog");	 //TODO: test
    }
	wakeWordActive() {
        return this.vadLedMode(1); 	//TODO: test
    }
	wakeWordInactive() {
        return this.vadLedMode(0);	//TODO: test
    }
}

class GpioItem {
	//ReSpeaker Mic Array v2.0 vendor specific USB LED interface.
	//Reference 1:	https://github.com/respeaker/pixel_ring/blob/master/pixel_ring/usb_pixel_ring_v2.py
	//Reference 2:	https://wiki.seeedstudio.com/ReSpeaker_Mic_Array_v2.0/#control-the-leds
	//Node USB API: https://github.com/node-usb/node-usb#legacy-api
	
	constructor(options){
		if (!options) options = {};
		
		this.isReady = false;
		
		//USB Device
		this._device = USB.findByIds(0x2886, 0x0018);	//hardcoded vendor/product ID
		this._device.timeout = 8000;
        this.pixelRing;
		
		//settings
		this._mode = options.mode || "sepia";		//TODO: implement
		this._brightness = options.brightness || 10;
	}
	
	init(successCallback, errorCallback){
		if (!this._device){
			errorCallback({name: "MissingDevice", message: "USB device not found"});
		}else{
			this.pixelRing = new PixelRing(this._device, this._mode);
			var that = this;
			try {
				//open device
				this._device.open();
				//set inital modes (VAD LED off, brightness half)
				that.pixelRing.vadLedMode(0).then(function(){
					that.pixelRing.brightness(that._brightness)
				}).then(function(){
					//done
					that.isReady = true;
					successCallback();
				}).catch(function(err){
					errorCallback(err);
				});
			}catch (err){
				errorCallback(err);
			}
		}
	}
	
	writeData(data, successCallback, errorCallback){
		if (!this.isReady){
			errorCallback({name: "NotReady", message: "Interface not yet ready"});
		}else if (!data || !data.state){
			errorCallback({name: "MissingData", message: "Required: state"});
		}else if (this.pixelRing.availableStates.indexOf(data.state) < 0){
			errorCallback({name: "WrongData", message: "Unknown state"});
		}else{
			try {
				//write state
				this.pixelRing[data.state](data.rgb0Array).then(function(res){
					successCallback();
				}).catch(function(err){
					errorCallback(err);
				});
			}catch (err){
				errorCallback(err);
			}
		}
	}
	
	readData(options, successCallback, errorCallback){
		if (this.pixelRing){
			var res = this.pixelRing.currentState;
			successCallback({result: res});
		}else{
			errorCallback({name: "NoData", message: "No data found"});
		}
	}
	
	release(successCallback, errorCallback){
		if (this._device){
			//switch all off
			if (this.pixelRing){
				//write state
				var that = this;
				this.pixelRing.idle().then(function(res){
					//done
					that._device.close();
					successCallback();
				}).catch(function(err){
					//done
					that._device.close();
					errorCallback(err);
				});
			}else{
				this._device.close();
				successCallback();
			}
		}else{
			successCallback();
		}
	}
}

//console test call example: node -e 'require("./respeaker-usb-array-v2").test({init: {}, write: {state: "speaking"}})'
function test(options){
	if (!options) options = {};
	var desc = description();
	console.log("GPIO Item Test: " + desc.info);
	var gpioItem = new GpioItem(options.init || {
		mode: "sepia"
	});
	console.log("GPIO init");
	gpioItem.init(function(){
		console.log("GPIO init: success - NEXT: write");
		gpioItem.writeData(options.write || {
			state: "loading"
		}, function(){
			console.log("GPIO write: success - NEXT: read in 3s");
			setTimeout(function(){
				gpioItem.readData(options.read || {}, function(data){
					console.log("GPIO read: success - data:", data, "- NEXT: release");
					gpioItem.release(function(data){
						console.log("GPIO release: success - Item test: DONE");
					}, function(err){
						console.error("GPIO release: error", err);
					});
				}, function(err){
					console.error("GPIO read: error", err);
				});
			}, 3000);
		}, function(err){
			console.error("GPIO write: error", err);
		});
	}, function(err){
		console.error("GPIO init: error", err);
	});
}

module.exports = {
	description: description,
	GpioItem: GpioItem,
	test: test,
};