//required: sudo usermod -a -G spi $USER
//double-check: ls -l /dev/spi*
const spi = require('spi-device');

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
		info: "ReSpeaker-ish audio HAT LED control via APA102 IC."
	};
}

class GpioItem {
	//APA102 IC LEDs - ReSpeaker MIC HAT
	//Reference:	https://github.com/respeaker/mic_hat/blob/master/interfaces/apa102.py
	//Useful: 	https://github.com/jonnypage-d3/hooloovoo/blob/master/hooloovoo.js
	//			https://github.com/respeaker/4mics_hat/issues/2#issuecomment-471563162
	
	constructor(options){
		if (!options) options = {};
		//LED config
		this._numOfLeds = options.numOfLeds || 3;		//2mic HAT has 3, 4mic has 12? ...
		this._ledBits = this._numOfLeds * 4 + 8;		//BGRb + 4 start frame bits + 4 end frame bits
		this._ledBuffer = Buffer.alloc(this._ledBits);	//full LEDs configuration
		
		//APA102 IC
		this.apa102;
		this.apa102Speed = 4000000; //4Mhz
		
		this.isReady = false;
		
		//set LED buffer
		this.setLedBuffer = function(ledIndex, rgbRed, rgbGreen, rgbBlue, brightness){
			let currentLed = 4 + (ledIndex * 4)
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
	}
	
	init(successCallback, errorCallback){
		//bus 0, device 0
		this.apa102 = spi.open(0, 0, err => {
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
			this.apa102.close(function(err){
				if (err){
					errorCallback(err);
				}else{
					successCallback();
				}
			});
		}else{
			successCallback();
		}
	}
}

module.exports = {
	description: description,
	GpioItem: GpioItem
};