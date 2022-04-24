//might be required: sudo usermod -a -G spi $USER
//double-check: ls -l /dev/spi*
//if you have connection issues: activate SPI interface in OS
const Color = require('color');
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
			{name: "numOfLeds", type: "number", min: 1},
			{name: "ledType", type: "string", values: ["ws281x", "apa102"]},
			{name: "spiBus", type: "number", values: [0, 1]},
			{name: "spiDevice", type: "number", values: [0, 1]}
		],
		writeInterface: [
			{name: "ledIndex", type: "number", min: 1},
			{name: "red", type: "number", min: 0, max: 255},
			{name: "green", type: "number", min: 0, max: 255},
			{name: "blue", type: "number", min: 0, max: 255}
		],
		info: "Interface to control RGB LEDs via SPI. Supported types WS281X and APA102."
	};
}

class GpioItem {
	//WS281X and APA102 LEDs
	//Reference:	https://github.com/jgarff/rpi_ws281x
	//				https://github.com/respeaker/mic_hat/blob/master/interfaces/apa102.py
	//Useful: 		https://github.com/zhincore/node-ws281x-spi
	//				https://github.com/joosteto/ws2812-spi
	//				https://github.com/jonnypage-d3/hooloovoo/blob/master/hooloovoo.js
	
	constructor(options){
		if (!options) options = {};
		
		this.isReady = false;
		
		//LED config
		this._numOfLeds = options.numOfLeds || 1;
		this._ledType = (options.ledType || "ws281x").toLowerCase();
		
		//SPI bus/device
		this._spiBusAndDevice = [options.spiBus || 0, options.spiDevice || 0];
		
		//Type specific settings
		this.spiInterface = undefined;
		this.typeSupported = false;
		if (this._ledType == "ws281x"){
			//WS281X
			this.typeSupported = true;
			this._spiMaxSpeed = 10000000; 	//10Mhz (100ns) - TODO: no idea why this works O_o
			this._ledBytes = this._numOfLeds * 9;		//8 bits per RGB * 3 for PWM
			this._spiOptions = {
				maxSpeedHz: this._spiMaxSpeed
			}
			this._spiMsgOptions = {
				microSecondDelay: 50
				//speedHz: this._spiMaxSpeed
			}
			
		}else if (this._ledType == "apa102"){
			//APA102
			this.typeSupported = true;
			this._spiMaxSpeed = 4000000; 	//4Mhz
			this._ledBytes = this._numOfLeds * 4 + 8;	//BGRb + 4 start frame bytes + 4 end frame bytes
			this._spiOptions = {
				maxSpeedHz: this._spiMaxSpeed
			}
			this._spiMsgOptions = {
				//speedHz: this._spiMaxSpeed
			}
			
		}else{
			this.typeSupported = false;
			this._ledBytes = 0;
		}

		//init. LED buffer
		this._ledBuffer = Buffer.alloc(this._ledBytes);	//full LEDs configuration
		
		//set LED buffer
		this.setLedBuffer = function(ledIndex, rgbRed, rgbGreen, rgbBlue){
			//WS281X
			if (this._ledType == "ws281x"){
				//GRB colors
				let currentLed = ledIndex * 9;
				let colors = [rgbGreen, rgbRed, rgbBlue];	//RGB to GRB array
				
				//convert color data to ws281x PWM wave represented by string of binary
				let pwmBits = colors.map(function(color){
					//convert each color component to binary octet and map to ws281x signal
					let cBits = color.toString(2).padStart(8, 0);	//color as 8 bits string
					return Array.from(cBits).map(function(bit){
						//embed each bit into 1x0, result: (1 0 0) => 0, (1 1 0) => 1
						return ("1" + bit + "0");
					}).join("");
				}).join("");
				
				//binary wave for this index
				let waveBinary = pwmBits.split("");
				//convert bits to bytes
				let n = 0;
				while (waveBinary.length){
					let octet = waveBinary.splice(0, 8).join("");	//next 8 bits
					let num = parseInt(octet, 2);	//number (0 - 255)
					//console.log("ledIndex: " + ledIndex + ", n: " + n + ", value: " + num);		//DEBUG
					this._ledBuffer[currentLed + n] = num;
					n++;
				}
				
			//APA102
			}else if (this._ledType == "apa102"){
				//BGRb colors
				let brightness = 255; 	//NOTE: we keep this constant because it seems to be quirky and we have RGB
				let currentLed = 4 + (ledIndex * 4);
				this._ledBuffer[currentLed + 1] = rgbBlue;
				this._ledBuffer[currentLed + 2] = rgbGreen;
				this._ledBuffer[currentLed + 3] = rgbRed;
				this._ledBuffer[currentLed + 0] = brightness;
			}
			//console.log("ledBuffer", this._ledBuffer);	//DEBUG
		}
		//set LED buffer - HEX string format, e.g. "#00ff00"
		this.setLedBufferHex = function(ledIndex, hexColorString){
			let rgb = Color(hexColorString).rgb().array();
			this.setLedBuffer(ledIndex, rgb[0], rgb[1], rgb[2]);
		}
		//set buffer for all LEDs
		this.setBufferAll = function(red, green, blue){
			for (let i=0; i < this._numOfLeds; i++) {
				this.setLedBuffer(i, red, green, blue);
			}
		}
		//transfer data
		this.transferBuffer = function(successCallback, errorCallback){
			let message = {};
			Object.assign(message, this._spiMsgOptions, {
				sendBuffer: this._ledBuffer,
				byteLength: this._ledBuffer.length
			});
			this.spiInterface.transfer([message], (err, response) => {
				if (err){
					errorCallback(err);
				}else{
					//console.log("transfer response", response);	//DEBUG
					//TODO: use response?
					successCallback({status: "transfered"});
				}
			});
		}
	}
	
	init(successCallback, errorCallback){
		if (!this.typeSupported){
			errorCallback({name: "NotSupported", message: "'ledType' not supported (yet)"});
			return;
		}
		//bus X, device Y
		this.spiInterface = spi.open(this._spiBusAndDevice[0], this._spiBusAndDevice[1], 
				this._spiOptions, err => {
			if (err){
				errorCallback(err);
			}else{
				//set all off
				this.setBufferAll(0, 0, 0);
				var that = this;
				this.transferBuffer(function(){
					//done
					that.isReady = true;
					if (that._ledType == "ws281x"){
						//it looks like we have to wait 1s or the first write is faulty
						setTimeout(function(){ successCallback(); }, 1000);
					}else{
						successCallback();
					}
				}, errorCallback);
			}
		});
	}
	
	writeData(data, successCallback, errorCallback){
		if (!this.isReady){
			errorCallback({name: "NotReady", message: "Interface not yet ready"});
		}else if (!data 
			|| (!data.hex && (data.red == undefined || data.blue == undefined || data.green == undefined))
			|| data.ledIndex == undefined
		){
			errorCallback({name: "MissingData", message: "Required: 'ledIndex' and {'red', 'green', 'blue'} or 'hex'"});
		}else if (data.ledIndex < 1 || data.ledIndex > this._numOfLeds){
			errorCallback({name: "WrongLedIndex", message: ("LED index must be between 1 and " + this._numOfLeds)});
		}else{
			try {
				let internalIndex = data.ledIndex - 1;
				if (data.hex){
					this.setLedBufferHex(internalIndex, data.hex);
				}else{
					this.setLedBuffer(internalIndex, +data.red, +data.green, +data.blue);
				}
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
		if (this.spiInterface){
			var that = this;
			//switch all off
			this.setBufferAll(0, 0, 0);
			this.transferBuffer(function(){
				//close controller
				that.spiInterface.close(function(err){
					if (err){
						errorCallback(err);
					}else{
						successCallback();
					}
				});
			}, function(err){
				errorCallback(err);
			});
		}else{
			successCallback();
		}
	}
}

//console test call example: node -e 'require("./rpi-spi-rgb-leds").test({init: {numOfLeds: 1, ledType: "ws281x"}})'
function test(options){
	if (!options) options = {};
	var desc = description();
	console.log("GPIO Item Test: " + desc.info);
	var gpioItem = new GpioItem(options.init || {
		numOfLeds: 1
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