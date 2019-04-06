/**
* CLEXI HTTP events broadcaster. This extension broadcasts the HTTP events received via /event endpoint.
*/	
ClexiHttpEventHandler = function(onStartCallback, onEventCallback, onErrorCallback){
	
	//Event - special method just for this extension (converts HTTP calls to websocket msg)
	this.event = function(method, request){
		var eventData = {};
		if (request.params && request.params.name){
			eventData.name = request.params.name;
		}else{
			eventData.name = "unnamed";
		}
		//split by method - only GET and POST are supported
		if (method == "POST"){
			//POST
			eventData.data = request.body;
		}else{
			//GET
			eventData.data = request.query;
		}
		//console.log(eventData); 		//DEBUG
		if (onEventCallback) onEventCallback({
			data: eventData
		});
		//no error method required
	}
		
	//Input - does nothing in this service (yet?)
	this.input = function(msg, socket){
		//console.log(JSON.stringify(msg, null, '  '));
		return;
	}
	
	if (onStartCallback) onStartCallback({
		msg: "CLEXI HTTP-Events initialized."
	});
};

module.exports = ClexiHttpEventHandler;