/* CLEXI - Client Extension Interface v0.7.0 */
var ClexiJS = (function(){
	var Clexi = {};
	
	//Extension subscriptions
	var subscriptions = {};
	
	//Websocket connection
	var hostURL;
	var ws;
	var msgId = 0;
	
	Clexi.connect = function(host, onOpen, onClose, onError){
		//URL
		if (host){
			//given URL
			hostURL = host;
		}else{
			//assume origin is WS host too
			if (location.origin.indexOf("https") == 0){
				hostURL = location.origin.replace(/^https/, 'wss');
			}else{
				hostURL = location.origin.replace(/^http/, 'ws');
			}
		}
		
		//Connect
		ws = new WebSocket(hostURL);
		
		//Events:
		
		ws.onopen = function(me){
			if (onOpen) onOpen(me);
		};
		
		ws.onmessage = function(me){
			//console.log(me);
			msg = JSON.parse(me.data);
			if (subscriptions[msg.type]){
				if (msg.data){
					//Extension event
					subscriptions[msg.type].onEvent(msg.data);
				}else if (msg.response){
					//Extension response to input
					subscriptions[msg.type].onResponse(msg.response, msg.id);
				}else if (msg.error){
					//Extension error
					subscriptions[msg.type].onError(msg.error);
				}
			}
		};
		
		ws.onerror = function(error){
			if (onError) onError(error);
		};
		
		ws.onclose = function(me){
			if (onClose) onClose(me);
		};
	}
	
	Clexi.close = function(){
		if (ws){
			ws.close();
		}
	}
	
	function autoReconnect(){
		//TODO
	}
	
	Clexi.send = function(extensionName, data){
		if (ws){
			var msg = {
				type: extensionName,
				data: data,
				id: ++msgId,
				ts: Date.now()
			};
			// Send the msg object as a JSON-formatted string.
			ws.send(JSON.stringify(msg));
		}
	}
	
	/**
	* Subscribe to an extension event. 
	* Note: currently you can have only one callback per extension. Feel free to
	* implement your own event dispatcher.
	*/
	Clexi.subscribeTo = function(extensionName, eventCallback, inputCallback, errorCallback){
		subscriptions[extensionName] = {
			onEvent: eventCallback || function(){},
			onResponse: inputCallback || function(){},
			onError: errorCallback || function(){}
		};
	}
	Clexi.removeSubscription = function(extensionName){
		delete subscriptions[extensionName];
	}
	
	return Clexi;
})();