/**
* Reference implementation for CLEXI extensions: CLEXI message broadcaster (send msg to all clients).
* Each extension can have 3 callbacks and one input method: onStartCallback, onEventCallback, onErrorCallback, input. 
* The 'onEventCallback' has to submit an object with the field 'data' that can contain arbitrary (serializeable) content. 
* The input method may use any request 'data' to control the extension (on/off etc.) or trigger events and must return an
* object or string.
*/	
ClexiBroadcaster = function(onStartCallback, onEventCallback, onErrorCallback){
	//Broadcast message
	function broadcast(msg, msgId, socket){
		if (onEventCallback) onEventCallback({
			data: {
				broadcast: msg
			}
		});
		//not implemented because it can't fail here (though it might fail outside extension on websocket layer):
		/*
		if (onErrorCallback) onErrorCallback({
			error: "???"
		});
		*/
	}
		
	//Input
	this.input = function(msg, socket){
		//console.log(JSON.stringify(msg, null, '  '));
		/* format submitted by client: 
		msg = {
			type: "extensionName",
			data: data,
			id: ++msgId,
			ts: Date.now()
		}
		*/
		var cast = msg.data;
		if (cast){
			broadcast(cast, msg.id, socket); 	//note: broadcast might arrive before response
			return "sent";
		}
		return "unknown request";
	}
	
	if (onStartCallback) onStartCallback({
		msg: "CLEXI-Broadcaster initialized."
	});
};

module.exports = ClexiBroadcaster;