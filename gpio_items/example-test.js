//might be required: sudo usermod -a -G spi $USER
//double-check: ls -l /dev/spi*
//if you have connection issues: activate SPI interface in OS
//run:
//node example-test.js
//
const plugin = require("./rpi-spi-rgb-leds");
console.log("description:", plugin.description());
/*
plugin.test({
	init: {
		ledType: "ws281x", numOfLeds: 1
	},
	write: {
		ledIndex: 1, red: 0, green: 0, blue: 100
	}
});
*/
var gpioItem = new plugin.GpioItem({
	ledType: "ws281x", numOfLeds: 1
});

var initProm = function(){
	return new Promise((resolve, reject) => {
		gpioItem.init(function(){
			setTimeout(function(){ resolve(); }, 1000);
		}, function(err){
			reject(err);
		});
	});
}
var writeProm = function(data, delayAfter){
	console.log("write data: " + JSON.stringify(data));
	return new Promise((resolve, reject) => {
		gpioItem.writeData(data, function(){
			if (!delayAfter) delayAfter = 500;
			setTimeout(function(){ resolve(); }, delayAfter);
		}, function(err){
			reject(err);
		});
	});
}

console.log("GPIO init");
initProm().then(function(){
	console.log("success");
	return writeProm({
		ledIndex: 1, red: 0, green: 0, blue: 0
	});
}).then(function(){
	return writeProm({
		ledIndex: 1, red: 80, green: 0, blue: 0
	});
}).then(function(){
	return writeProm({
		ledIndex: 1, red: 0, green: 80, blue: 0
	});
}).then(function(){
	return writeProm({
		ledIndex: 1, red: 0, green: 0, blue: 80
	});
}).then(function(){
	return writeProm({
		ledIndex: 1, red: 50, green: 50, blue: 50
	});
}).then(function(){
	return writeProm({
		ledIndex: 1, red: 0, green: 0, blue: 0
	});
}).then(function(){
	return writeProm({
		ledIndex: 1, hex: "#ceff1a"
	});
}).then(function(){
	console.log("success - NEXT: release in 3s");
	setTimeout(function(){
		gpioItem.release(function(data){
			console.log("GPIO release: success - Item test: DONE");
		}, function(err){
			console.error("GPIO release: error", err);
		});
	}, 3000);
}).catch(function(err){
	console.error("Error:", err);
});
