const { RIO } = require('rpi-io');

/**
* This extension can send control events to the GPIO pins of a Raspberry Pi
* and receive state changes like button press etc..
*/	
GpioInterface = function(onStartCallback, onEventCallback, onErrorCallback){
	//Direct GPIO control
	var buttons = {};
	var leds = {};
	//More complex control (e.g. SPI interface)
	var items = {};
	
	//release all on server close
	function cleanUpGpio(eventType){
		if (cleanUpDone){
			process.exit(0);
			return;
		}
		var exitTimer;
		try {
			console.log("GPIO-Interface: Clean-up before exit (ev: " + eventType + ")");
			exitTimer = setTimeout(function(){
				console.error("GPIO-Interface: Failed to exit gracefully - Took too long.");
				process.exit(1);
			}, 3000);
			startReleaseAll(function(releasedNum, totalNum){
				//done
				console.log("GPIO-Interface: EXIT.");		//DEBUG
				cleanUpDone = true;
				clearTimeout(exitTimer);
				process.exit(0);
			});
		}catch (err){
			console.error("GPIO-Interface: Failed to exit gracefully", err);
			clearTimeout(exitTimer);
			process.exit(1);
		}
	}
	['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'].forEach((eventType) => {
		process.on(eventType, cleanUpGpio.bind(null, eventType));
	});
	var cleanUpDone = false;
	
	//ALL
	
	//release all
	function releaseAll(msgId){
		startReleaseAll(function(releasedNum, totalNum){
			broadcast({
				type: "releaseAll",
				msgId: msgId,
				status: "success",
				released: releasedNum,
				failed: (totalNum - releasedNum)
			});
		});
		return "sent";
	}
	function startReleaseAll(doneCallback){
		var shouldRelease = Object.keys(buttons).length + Object.keys(leds).length + Object.keys(items).length;
		var hasReleased = 0;
		var failedRelease = 0;
		console.log("GPIO-Interface: Releasing " + shouldRelease + " registered GPIO handlers.");		//DEBUG
		//NOTE: we could use 'RIO.closeAll()' to release all buttons and LEDs at the same time
		//buttons
		Object.keys(buttons).forEach(function(id){
			try {
				releaseButtonSync(buttons[id]);
				hasReleased++;
			}catch(err){
				failedRelease++;
			}
			checkReleaseAllDone(shouldRelease, hasReleased, failedRelease, doneCallback);
		});
		//leds
		Object.keys(leds).forEach(function(id){
			try {
				releaseLedSync(leds[id]);
				hasReleased++;
			}catch(err){
				failedRelease++;
			}
			checkReleaseAllDone(shouldRelease, hasReleased, failedRelease, doneCallback);
		});
		//items
		Object.values(items).forEach(function(item){
			item.release(function(){
				hasReleased++;
				checkReleaseAllDone(shouldRelease, hasReleased, failedRelease, doneCallback);
			}, function(err){
				failedRelease++;
				checkReleaseAllDone(shouldRelease, hasReleased, failedRelease, doneCallback);
			});
		});
	}
	function checkReleaseAllDone(should, has, failed, doneCallback){
		if ((has + failed) >= should){
			buttons = {};
			leds = {};
			items = {};
			if (failed > 0){
				console.log("GPIO-Interface: Tried to release all handlers, but " + failed + ".");		//DEBUG
			}else{
				console.log("GPIO-Interface: Released all handlers.");		//DEBUG
			}
			doneCallback(has, should);
		}
	}
	//get all
	function getAll(msgId){
		var buttonsInfo = [];
		Object.keys(buttons).forEach(function(id){
			buttonsInfo.push(buttons[id].clexiInfo);
		});
		var ledsInfo = [];
		Object.keys(leds).forEach(function(id){
			ledsInfo.push(leds[id].clexiInfo);
		});
		var itemsInfo = [];
		Object.keys(items).forEach(function(id){
			itemsInfo.push(items[id].clexiInfo);
		});
		broadcast({
			type: "getAll",
			msgId: msgId,
			buttons: buttonsInfo,
			leds: ledsInfo,
			items: itemsInfo
		});
		return "sent";
	}
	
	//BUTTONS (GPIO direct)
	
	function registerButton(config, msgId){
		var pin = (config.pin != undefined)? +config.pin : undefined;
		var id = config.id || (pin + "");
		var edge = config.edge || "both";
		var bias = config.options?.bias || "pull-up";
		var pullType = (bias == "pull-up")? 1 : 2;
		var bounce = config.options?.bounce || 100;	//threshold [ms] to filter consecutive events of same type
		if (buttons[id]){
			onButtonError("Button already registered", 423, msgId);
			//NOTE: if the PIN is already in use, the lib will throw the error (I think)
			return "sent";
		}
		console.log("GPIO-Interface: registerButton", id, pin, edge);		//DEBUG
		if (typeof pin == "number" 
			&& ["rising", "falling", "both"].indexOf(edge) >= 0
			&& ["disable", "pull-up", "pull-down"].indexOf(bias) >= 0
		){
			try {
				//register button listener
				buttons[id] = new RIO(pin, "input", { bias: bias });		
				buttons[id].clexiInfo = { id: id, pin: pin };
				buttons[id].monitoringStart((triggeredEdge) => {
					var val = 0;
					if (triggeredEdge == edge){
						//value is 1 if we match the monitored edge
						val = 1;
					}else if (triggeredEdge == "rising"){
						val = (pullType == 1)? 0 : 1;
					}else{
						val = (pullType == 1)? 1 : 0;
					}
					broadcast({
						type: "button",
						id: id,
						pin: pin,
						value: val
					});
				}, edge, bounce);
				
				broadcast({
					type: "buttonRegister",
					msgId: msgId,
					id: id,
					pin: pin
				});
			}catch (err){
				if (!err) err = {message: "Failed to register LED"};
				onButtonError(err.message || err.name || "Failed to register LED", 500, msgId);
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
				//stop monitoring and release resources
				releaseButtonSync(buttons[id]);
				delete buttons[id];
				broadcast({
					type: "buttonRelease",
					msgId: msgId,
					id: id,
					pin: pin
				});
			}catch (err){
				if (!err) err = {message: "Failed to release LED"};
				onButtonError(err.message || err.name || "Failed to release LED", 500, msgId);
			}
		}else{
			broadcast({
				type: "buttonNotFound",
				msgId: msgId,
				id: id,
				pin: pin
			});
		}
		return "sent";
	}
	function releaseButtonSync(item){
		item.close();
	}
	function onButtonError(msg, code, msgId, itemId){
		if (onErrorCallback){
			var msg = {
				error: {
					name: "GpioButtonError",
					msg: msg,
					code: code,
					msgId: msgId
				}
			};
			if (itemId) msg.error.itemId = itemId;
			onErrorCallback(msg);
		}
	}
	
	//LEDs (GPIO direct)
	
	function registerLed(config, msgId){
		var pin = (config.pin != undefined)? +config.pin : undefined;
		var id = config.id || (pin + "");
		//NOTE: during the port from 'onoff' to 'rpi-io', options "high" and "low" have been removed
		var direction = "output";
		var initialValue = config.options?.value || 0;
		if (leds[id]){
			onLedError("LED already registered", 423, msgId);
			//NOTE: if the PIN is already in use, the lib will throw the error (I think)
			return "sent";
		}
		console.log("GPIO-Interface: registerLed", id, pin);		//DEBUG
		if (typeof pin == "number"){
			try {
				//register LED
				leds[id] = new RIO(pin, direction, { value: initialValue });
				leds[id].clexiInfo = {id: id, pin: pin};
				broadcast({
					type: "ledRegister",
					msgId: msgId,
					id: id,
					pin: pin
				});
			}catch (err){
				if (!err) err = {message: "Failed to register LED"};
				onLedError(err.message || err.name || "Failed to register LED", 500, msgId);
			}
		}else{
			onLedError("Invalid LED configuration", 400, msgId);
		}
		return "sent";
	}
	function releaseLed(config, msgId){
		var pin = (config.pin != undefined)? +config.pin : undefined;
		var id = config.id || (pin + "");
		if (leds[id]){
			try {
				releaseLedSync(leds[id]);
				delete leds[id];
				broadcast({
					type: "ledRelease",
					msgId: msgId,
					id: id,
					pin: pin
				});
			}catch (err){
				if (!err) err = {message: "Failed to release LED"};
				onLedError(err.message || err.name || "Failed to release LED", 500, msgId);
			}
		}else{
			broadcast({
				type: "ledNotFound",
				msgId: msgId,
				id: id,
				pin: pin
			});
		}
		return "sent";
	}
	function releaseLedSync(item){
		item.close();
	}
	function setLed(config, msgId){
		var pin = (config.pin != undefined)? +config.pin : undefined;
		var id = config.id || (pin + "");
		if (config.value == undefined){
			onLedError("Invalid or missing value for 'set' action.", 400, msgId);
			return "sent";
		}
		var val = (config.value == 1 || config.value === true)? 1 : 0;
		if (leds[id]){
			try {
				//rpi-io: write() is synchronous
				leds[id].write(val);

				broadcast({
					type: "ledSet",
					msgId: msgId,
					id: id,
					set: val
				});
			}catch (err){
				if (!err) err = {message: "Failed to set LED"};
				onLedError(err.message || err.name || "Failed to set LED", 500, msgId, id, "set");
			}
		}else{
			broadcast({
				type: "ledNotFound",
				msgId: msgId,
				id: id,
				pin: pin
			});
		}
		return "sent";
	}
	function onLedError(msg, code, msgId, itemId, action){
		if (onErrorCallback){
			var msg = {
				error: {
					name: "GpioLedError",
					msg: msg,
					code: code,
					msgId: msgId
				}
			}
			if (itemId != undefined) msg.error.itemId = itemId;
			if (action != undefined) msg.error.action = action;
			onErrorCallback(msg);
		}
	}
	
	//ITEMS (folder: ../gpio_items/)
	
	function registerItem(config, msgId){
		//check
		if (!checkAndCleanFileName(config, msgId)){
			return "sent";
		}
		var id = config.id || config.file;
		if (items[id]){
			onItemError("Item already registered", 423, msgId);
			//TODO: should this be limited to 'id' or to 'file'?
			return "sent";
		}
		console.log("GPIO-Interface: registerItem", id, config.file);		//DEBUG
		try {
			//require item file
			var path = "../gpio_items/" + config.file;
			const ItemModule = require(path);
			var itemDesc = ItemModule.description();
			//console.log("Item desc.", itemDesc);						//DEBUG
			items[id] = new ItemModule.GpioItem(config.options);
			items[id].clexiInfo = {id: id, file: config.file};
			//console.log("Item", items[id]);							//DEBUG
			//init - TODO: make optional?
			items[id].init(function(){
				//done
				broadcast({
					type: "itemRegister",
					msgId: msgId,
					id: id,
					file: config.file,
					description: itemDesc
				});
			}, function(err){
				if (!err) err = {message: "Failed to init. item"};
				onItemError(err.message || err.name || "Failed to init. item", 500, msgId);
			});
		}catch (err){
			if (!err) err = {message: "Failed to register item"};
			onItemError(err.message || err.name || "Failed to register item", 500, msgId);
		}
		return "sent";
	}
	function releaseItem(config, msgId){
		//check
		if (!checkAndCleanFileName(config, msgId)){
			return "sent";
		}
		var id = config.id || config.file;
		if (items[id]){
			try {
				items[id].release(function(){
					delete items[id];
					broadcast({
						type: "itemRelease",
						msgId: msgId,
						id: id
					});
				}, function(err){
					if (!err) err = {message: "Failed to release item"};
					onItemError(err.message || err.name || "Failed to release item", 500, msgId);
				});
			}catch (err){
				if (!err) err = {message: "Failed to release item"};
				onItemError(err.message || err.name || "Failed to release item", 500, msgId);
			}
		}else{
			broadcast({
				type: "itemNotFound",
				msgId: msgId,
				id: id
			});
		}
		return "sent";
	}
	function setItem(config, msgId){
		//check
		if (!checkAndCleanFileName(config, msgId)){
			return "sent";
		}
		var data = config.data;
		if (data == undefined){
			onItemError("Invalid or missing item data for 'set' action.", 400, msgId);
			return "sent";
		}
		var id = config.id || config.file;
		if (items[id]){
			try {
				items[id].writeData(data, function(res){
					broadcast({
						type: "itemSet",
						msgId: msgId,
						id: id,
						result: res
					});
				}, function(err){
					if (!err) err = {message: "Failed to set item"};
					onItemError(err.message || err.name || "Failed to set item", 500, msgId, id, "set");
				});
			}catch (err){
				if (!err) err = {message: "Failed to set item"};
				onItemError(err.message || err.name || "Failed to set item", 500, msgId, id, "set");
			}
		}else{
			broadcast({
				type: "itemNotFound",
				msgId: msgId,
				id: id
			});
		}
		return "sent";
	}
	function getItem(config, msgId){
		//check
		if (!checkAndCleanFileName(config, msgId)){
			return "sent";
		}
		var id = config.id || config.file;
		var options = config.options || {};
		if (items[id]){
			try {
				items[id].readData(options, function(data){
					broadcast({
						type: "itemGet",
						msgId: msgId,
						id: id,
						data: data
					});
				}, function(err){
					if (!err) err = {message: "Failed to get item"};
					onItemError(err.message || err.name || "Failed to get item", 500, msgId, id, "get");
				});
			}catch (err){
				if (!err) err = {message: "Failed to get item"};
				onItemError(err.message || err.name || "Failed to get item", 500, msgId, id, "get");
			}
		}else{
			broadcast({
				type: "itemNotFound",
				msgId: msgId,
				id: id
			});
		}
		return "sent";
	}
	function checkAndCleanFileName(config, msgId){
		//check
		if (!config || !config.file){
			onItemError("Invalid item configuration, missing interface file name.", 400, msgId);
			return;
		}else{
			//sanitize
			config.file = config.file.split(".")[0].replace(/[^a-zA-Z0-9_-]/g, "");
			//still ok?
			if (!config.file){
				onItemError("Invalid item configuration, invalid file name.", 400, msgId);
				return;
			}
		}
		return true;
	}
	function onItemError(msg, code, msgId, itemId, action){
		if (onErrorCallback){
			var msg = {
				error: {
					name: "GpioItemError",
					msg: msg,
					code: code,
					msgId: msgId
				}
			};
			if (itemId != undefined) msg.error.itemId = itemId;
			if (action != undefined) msg.error.action = action;
			onErrorCallback(msg);
		}
	}
	
	//---- CLEXI INTERFACE ----
	
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
			var action = msg.data.action;	//register, release, set, get
			var type = msg.data.type;		//button, led, item
			var config = msg.data.config;	//context dependent
			
			//handle action
			if (type == "button"){
				if (action == "register"){
					//config: id (any name), pin (number), edge (rising, falling, both), options
					return registerButton(config, msgId);
				}else if (action == "release"){
					//config: id (any name), pin (number)
					return releaseButton(config, msgId);
				}
			}else if (type == "led"){
				if (action == "register"){
					//config: id (any name), pin (number), options
					return registerLed(config, msgId);
				}else if (action == "release"){
					//config: id (any name), pin (number)
					return releaseLed(config, msgId);
				}else if (action == "set"){
					//config: id (any name), pin (number), value (number)
					return setLed(config, msgId);
				}
			}else if (type == "item"){
				if (action == "register"){
					//config: id (any name), file (string), options (object)
					return registerItem(config, msgId);
				}else if (action == "release"){
					//config: id (any name), file (string)
					return releaseItem(config, msgId);
				}else if (action == "set"){
					//config: id (any name), file (string), data (object)
					return setItem(config, msgId);
				}else if (action == "get"){
					//config: id (any name), file (string), options (object)
					return getItem(config, msgId);
				}
			}else if (type == "all"){
				if (action == "get"){
					return getAll(msgId);
				}else if (action == "release"){
					return releaseAll(msgId);
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