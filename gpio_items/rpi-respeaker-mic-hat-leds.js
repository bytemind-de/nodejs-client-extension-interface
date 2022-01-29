//might be required: sudo usermod -a -G spi $USER
//double-check: ls -l /dev/spi*
//if you have connection issues: activate SPI interface in OS, check pin 5
const Gpio = require('onoff').Gpio;		//required for pin 5 voltage
const spi = require('spi-device');

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
		type: "ledArray",
		options: [
			{name: "numOfLeds", type: "number", min: 1}
		],
		writeInterface: [
			{name: "ledIndex", type: "number", min: 1},
			{name: "red", type: "number", min: 0, max: 255},
			{name: "green", type: "number", min: 0, max: 255},
			{name: "blue", type: "number", min: 0, max: 255}
		],
		info: "ReSpeaker-ish audio HAT APA102 LEDs interface."
	};
}

class GpioItem {
	//APA102 LEDs - ReSpeaker MIC HAT
	//Reference:	https://github.com/respeaker/mic_hat/blob/master/interfaces/apa102.py
	//Useful: 	https://github.com/jonnypage-d3/hooloovoo/blob/master/hooloovoo.js
	//			https://github.com/respeaker/4mics_hat/issues/2#issuecomment-471563162
	
	constructor(options){
		if (!options) options = {};
		
		this.isReady = false;
		
		//LED config
		this._model = options.model || "2mic";			//2mic, 4mic, 6mic, 4micL
		this._numOfLeds = options.numOfLeds;			//2mic HAT has 3, 4mic has 12? ...
		if (this._numOfLeds == undefined){
			if (this._model == "2mic"){
				this._numOfLeds = 3;
			}else if (this._model == "4mic" || this._model == "6mic"){
				this._numOfLeds = 12;
			}else if (this._model == "4micL"){
				this._numOfLeds = 0;	//4mic linear array has no APA102s (use pin 5 LED?)
			}else{
				this._numOfLeds = 1;
			}
		}
		
		//APA102 IC
		this.apa102;
		this.apa102Speed = 4000000; //4Mhz
		
		//SPI bus/device
		this._spiBusAndDevice = [0, 0];					//TODO: e.g. 4mic uses [0, 1]
		this.pin5 = undefined;
		if (this._model == "4mic"){
			this._spiBusAndDevice = [0, 1];
			//activate pin 5 (required for some mic HATs)
			this.pin5 = new Gpio(5, "out");
			this.pin5.writeSync(1);
		}

		//init. LED buffer
		this._ledBits = this._numOfLeds * 4 + 8;		//BGRb + 4 start frame bits + 4 end frame bits
		this._ledBuffer = Buffer.alloc(this._ledBits);	//full LEDs configuration
		
		//set LED buffer
		this.setLedBuffer = function(ledIndex, rgbRed, rgbGreen, rgbBlue, brightness){
			let currentLed = 4 + (ledIndex * 4);
			this._ledBuffer[currentLed + 1] = rgbBlue;
			this._ledBuffer[currentLed + 2] = rgbGreen;
			this._ledBuffer[currentLed + 3] = rgbRed;
			this._ledBuffer[currentLed + 0] = brightness;
		}
		//set buffer for all LEDs
		this.setBufferAll = function(red, green, blue, brightness){
			for (let i=0; i < this._numOfLeds; i++) {
				this.setLedBuffer(i, red, green, blue, brightness);
			}
		}
		//transfer data
		this.transferBuffer = function(successCallback, errorCallback){
			let message = [{
				sendBuffer: this._ledBuffer,
				//receiveBuffer: Buffer.alloc(led_bits),
				byteLength: this._ledBits,
				speedHz: this.apa102Speed
			}];
			this.apa102.transfer(message, (err, response) => {
				if (err){
					errorCallback(err);
				}else{
					//console.log("transfer response", response);	//DEBUG
					//TODO: use response?
					successCallback({status: "transfered"});
				}
			});
		}
		//release pin 5
		this.releasePin5 = function(){
			if (this.pin5){
				//reset pin 5
				try {
					this.pin5.writeSync(0);
					this.pin5.unexport();
				}catch (err){
					//we ignore the error, just print it
					console.error("GPIO-Interface: Failed to release pin 5 in 'rpi-respeaker-mic-hat-leds' item.", err);
				}
			}
		}
	}
	
	init(successCallback, errorCallback){
		//bus 0, device 0
		this.apa102 = spi.open(this._spiBusAndDevice[0], this._spiBusAndDevice[1], err => {
			if (err){
				errorCallback(err);
			}else{
				//init. buffer
				for (let i=0; i < this._ledBits; i++){
					if (i < (this._ledBits - 4)){
						this._ledBuffer[i] = 0x00;
					}else{
						this._ledBuffer[i] = 255;
					}
				}
				//set all off
				this.setBufferAll(0, 0, 0, 255);
				var that = this;
				this.transferBuffer(function(){
					//done
					that.isReady = true;
					successCallback();
				}, errorCallback);
			}
		});
	}
	
	writeData(data, successCallback, errorCallback){
		if (!this.isReady){
			errorCallback({name: "NotReady", message: "Interface not yet ready"});
		}else if (!data 
			|| data.red == undefined || data.blue == undefined || data.green == undefined
			|| data.ledIndex == undefined
		){
			errorCallback({name: "MissingData", message: "Required: ledIndex, red, green, blue"});
		}else if (data.ledIndex < 1 || data.ledIndex > this._numOfLeds){
			errorCallback({name: "WrongLedIndex", message: ("LED index must be between 1 and " + this._numOfLeds)});
		}else{
			try {
				let brightness = 255; 	//NOTE: we keep this constant because it quirky anyway
				let internalIndex = data.ledIndex - 1;
				this.setLedBuffer(internalIndex, +data.red, +data.green, +data.blue, brightness);
				//write
				this.transferBuffer(successCallback, errorCallback);
			}catch (err){
				errorCallback(err);
			}
		}
	}
	
	readData(options, successCallback, errorCallback){
		//TODO: converted to RGB data? read fresh from device?
		if (this._ledBuffer){
			successCallback({result: this._ledBuffer});
		}else{
			errorCallback({name: "NoData", message: "No data found"});
		}
	}
	
	release(successCallback, errorCallback){
		if (this.apa102){
			//switch all off
			this.setBufferAll(0, 0, 0, 255);
			var that = this;
			this.transferBuffer(function(){
				//close controller
				that.apa102.close(function(err){
					if (err){
						errorCallback(err);
					}else{
						//try to release pin 5 (if required)
						that.releasePin5();
						successCallback();
					}
				});
			}, function(err){
				//try to release pin 5 anyway (if required)
				that.releasePin5();
				errorCallback(err);
			});
		}else if (this.pin5){
			this.releasePin5();
		}else{
			successCallback();
		}
	}
}

//console test call example: node -e 'require("./rpi-respeaker-mic-hat-leds").test({init: {model: "2mic"}})'
function test(options){
	if (!options) options = {};
	var desc = description();
	console.log("GPIO Item Test: " + desc.info);
	var gpioItem = new GpioItem(options.init || {
		model: "", numOfLeds: 1
	});
	console.log("GPIO init");
	gpioItem.init(function(){
		console.log("GPIO init: success - NEXT: write");
		gpioItem.writeData(options.write || {
			ledIndex: 1, red: 150, green: 0, blue: 150
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
	test: test
};