'use strict'

const path = require('path');
const fs = require('fs');
const fastify = require('fastify');
const fastify_static = require('fastify-static');
const fastify_ws = require('fastify-ws');

//Server
const settings = require('./settings.json');
const port = settings.port || 8443;
const hostname = settings.hostname || "localhost";	//default: 127.0.0.1, all: 0.0.0.0
let server_options = {
	//http2: true,
};
if (settings.logger){
	server_options.logger = settings.logger;
}else{
	server_options.logger = { 
		level: 'info' 
	};
}
if (settings.ssl){
	server_options.https = {
		key: fs.readFileSync(path.join(__dirname, '/ssl/key.pem')),
		cert: fs.readFileSync(path.join(__dirname, '/ssl/certificate.pem'))
    };
}
const server = fastify(server_options);

//Plugins
server.register(fastify_static, { 
	root: path.join(__dirname, '/www') 
});
server.register(fastify_ws);

//Xtensions
var xtensions = {};
function loadXtensions(){
	let n = 0;
	if (settings.xtensions && (settings.xtensions instanceof Array)){
		for (let i=0; i<settings.xtensions.length; i++){
			n++;
			let X = require('./xtensions/' + settings.xtensions);
			xtensions[settings.xtensions] = new X(
				function(msg){
					//On start
					console.log(JSON.stringify(msg, null, '  '));
					
				}, function(msg){
					//On event
					//console.log(JSON.stringify(msg, null, '  '));
					console.log('Broadcasting event: ' + msg.type);
					broadcast(msg);
					
				}, function(error){
					//On error
					console.log(JSON.stringify(error, null, '  '));
					broadcast(error);
				}
			);
		}
		console.log('Loaded extensions: ' + n);
	}
}

// Broadcast to all.
function broadcast(data){
	server.ws.clients.forEach(function each(client) {
		if (client.readyState === 1) {		//WebSocket.OPEN should be 1
			if (typeof data === "object"){
				client.send(JSON.stringify(data));
			}else{
				client.send(data);
			}
		}
	});
}

// Run the server!
server.listen(port, hostname, function(err, address){
	if (err){
		server.log.error(err);
		process.exit(1);
	}
	//server.log.info(`Server running at ${address}`);
	console.log(`Server running at: ${address}`);
	console.log(`Hostname: ${hostname} - SSL: ${settings.ssl}`);
	
	//Websocket interface
	server.ws.on('connection', function(socket){
		console.log('Client connected.');
		
		socket.on('message', function(msg){
			//Broadcast to all
			//broadcast(msg);
			//socket.send(msg);
			
			//Handle extensions input
			let msgObj = JSON.parse(msg);
			console.log('Calling plugin: ' + msgObj.type);
			if (msgObj.type && xtensions[msgObj.type]){
				let response = xtensions[msgObj.type].input(msgObj);
				socket.send(JSON.stringify({
					response: response,
					type: msgObj.type
				}));
			
			//msg
			}else if (msgObj.type && msgObj.type == "msg"){
				socket.send(JSON.stringify({
					response: msgObj.text,
					type: msgObj.type
				}));
			
			//undefined
			}else{
				socket.send(JSON.stringify({
					response: ("unknown message type: " + msgObj.type),
					type: "undefined"
				}));
			}
		});
		
		socket.on('close', function(){
			console.log('Client disconnected.');
		});
		
		socket.on('error', function(e){
			console.log(`Client error: ${e.message}`);
		});
	});
	
	//Load extensions
	loadXtensions();
});