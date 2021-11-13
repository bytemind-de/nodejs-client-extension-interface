const Gpio = require('onoff').Gpio;

/**
* This extension can send control events to the GPIO pins of a Raspberry Pi
* and receive state changes like button press etc..
*/	
GpioInterface = function(onStartCallback, onEventCallback, onErrorCallback){
	var buttons = {};
	var leds = {};
	
	//release all on server close
	process.on('SIGINT', _ => {
		console.log("GPIO-Interface: Releasing all registered GPIO pin listeners");
		Object.values(buttons).forEach(function(btn){
			btn.unexport();
		});
		Object.values(leds).forEach(function(led){
			led.unexport();
		});
	});
	
	//register and remove buttons
	function registerButton(config, msgId){
		var pin = (config.pin != undefined)? +config.pin : undefined;
		var id = config.id || (pin + "");
		var direction = config.direction || "in";
		var edge = config.edge || "both";
		console.log("GPIO-Interface: registerButton", id, pin, direction, edge);		//DEBUG
		if (typeof pin == "number" 
			&& ["in", "out", "high", "low"].indexOf(direction) >= 0
			&& ["none", "rising", "falling", "both"].indexOf(edge) >= 0
			&& buttons[id] == undefined
		){
			try {
				//register button listener
				buttons[id] = new Gpio(pin, direction, edge, config.options);
				buttons[id].watch(function(err, value){
					if (err){
						onButtonError(err.message || err.name || "Button error", 500);
					}else{
						broadcast({
							type: "button",
							id: id,
							pin: pin,
							value: value
						});
					}
				});
				broadcast({
					type: "buttonRegister",
					id: id,
					pin: pin
				});
			}catch (err){
				if (!err) err = {message: "Failed to register button"};
				onButtonError(err.message || err.name || "Failed to register button", 500, msgId);
			}
		}else{
			onButtonError("Invalid button configuration", 400, msgId);
		}
		return "sent";
	}
	function releaseButton(config, msgId){
		var pin = (config.pin != undefined)? +config.pin : undefined;
		var id = config.id || (pin + "");
		if (buttons[id]){
			try {
				buttons[id].unwatchAll();
				buttons[id].unexport();		//TODO: after this we "should" not register a new button!?
				delete buttons[id];
				broadcast({
					type: "buttonRelease",
					id: id,
					pin: pin
				});
			}catch (err){
				if (!err) err = {message: "Failed to release button"};
				onButtonError(err.message || err.name || "Failed to release button", 500, msgId);
			}
		}else{
			broadcast({
				type: "buttonNotFound",
				id: id,
				pin: pin
			});
		}
		return "sent";
	}
	function onButtonError(msg, code, msgId){
		if (onErrorCallback) onErrorCallback({
			error: {
				name: "GpioButtonError",
				msg: msg,
				code: code,
				msgId: msgId
			}
		});
	}
	
	//Broadcast message
	function broadcast(msg, msgId, socket){
		if (onEventCallback) onEventCallback({
			data: {
				gpio: msg
			}
		});
	}
		
	//Input
	this.input = function(msg, socket){
		//console.log(JSON.stringify(msg, null, '  '));
		var msgId = msg.id;
		if (msg.data){
			var action = msg.data.action;	//register, release, set
			var type = msg.data.type;		//button, led
			var config = msg.data.config;	
			//config: id (any name), pin (number), direction (in, out, high, low), edge (none, rising, falling, both), options
			
			//handle action
			if (type == "button"){
				if (action == "register"){
					return registerButton(config, msgId);
				}else if (action == "release"){
					return releaseButton(config, msgId);
				}
			}else if (type == "led"){
				if (action == "register"){
					
				}else if (action == "release"){
					
				}else if (action == "set"){
					
				}
			}
		}
		return "unknown or invalid request";
	}
	
	if (onStartCallback) onStartCallback({
		msg: "GPIO-Interface initialized."
	});
};

module.exports = GpioInterface;