'use strict'

const path = require('path');
const fs = require('fs');
const fastify = require('fastify');
const fastify_static = require('fastify-static');
const fastify_ws = require('fastify-ws');

//Server
const version = "0.7.0";
const settings = require('./settings.json');

var Clexi = function(customSettings){
	var ClexiServer = {};
	
	if (!customSettings) customSettings = {};
	
	var port = customSettings.port || settings.port || 8443;
	var hostname = customSettings.hostname || settings.hostname || "localhost";	//default: 127.0.0.1, all: 0.0.0.0
	
	var sslCertPath = customSettings.sslCertPath || path.join(__dirname, "ssl");
	var wwwPath = customSettings.wwwPath || path.join(__dirname, "www");
	var defaultXtensionsPath = path.join(__dirname, 'xtensions');
	var customXtensionsPath = customSettings.customXtensionsPath || defaultXtensionsPath;
	var customXtensions = customSettings.customXtensions || [];
	
	var server_options = {
		//http2: true,
	};
	if (customSettings.logger){
		server_options.logger = customSettings.logger;
	}else if (settings.logger){
		server_options.logger = settings.logger;
	}else{
		server_options.logger = { 
			level: 'info' 
		};
	}
	var isLogLevelDebugOrTrace = (server_options.logger.level && (server_options.logger.level == "debug" || server_options.logger.level == "trace"));
	var useSsl = (customSettings.ssl != undefined)? customSettings.ssl : settings.ssl;
	if (useSsl){
		server_options.https = {
			key: fs.readFileSync(path.join(sslCertPath, 'key.pem')),
			cert: fs.readFileSync(path.join(sslCertPath, 'certificate.pem'))
		};
	}
	const server = fastify(server_options);
	ClexiServer.fastify = server;

	//Plugins
	server.register(fastify_static, { 
		root: wwwPath 
	});
	server.register(fastify_ws);

	//Xtensions
	var xtensions = {};
	function loadXtensions(){
		let n = 0;
		if (settings.xtensions && (settings.xtensions instanceof Array)){
			//Load default extensions
			n += loadXtensionsArray(settings.xtensions, defaultXtensionsPath);
		}
		if (customXtensions && (customXtensions instanceof Array)){
			//Load custom extensions
			n += loadXtensionsArray(customXtensions, customXtensionsPath);
			//NOTE: will overwrite extension if they have same name
		}
		console.log('CLEXI Xtensions loaded: ' + n);
	}
	function loadXtensionsArray(xtensionNames, xtensionsPath){
		let n = 0;
		for (var i=0; i<xtensionNames.length; i++){
			n++;
			let xName = xtensionNames[i];
			let X = require(path.join(xtensionsPath, xName));
			xtensions[xName] = new X(
				function(msg){
					//On start
					msg.type = xName;
					server.log.info(JSON.stringify(msg, null, '  '));
					
				//EVENT OUTPUT TO CLIENT
				}, function(msg){
					//On event
					msg.type = xName;
					if (isLogLevelDebugOrTrace){
						server.log.debug('Broadcasting event: ' + msg.type);
						server.log.trace(JSON.stringify(msg, null, '  '));
					}
					broadcast(msg);
					
				}, function(error){
					//On error
					error.type = xName;
					server.log.error(JSON.stringify(error, null, '  '));
					broadcast(error);
				}
			);
		}
		return n;
	}
	
	function getXtensionsInfo(){
		var info = {};
		Object.keys(xtensions).forEach(function(name) {
			info[name] = { active: true };		//TODO: one could add interface information here for each xtension
		});
		return info;
	}

	//Broadcast to receiver or all
	function broadcast(data){
		if (data.receiver){
			//single receiver?
			var client = data.receiver;
			delete data.receiver; 	//remove object before sending
			if (typeof data === "object"){
				client.send(JSON.stringify(data));
			}else{
				client.send(data);
			}
		}else{
			//broadcast to all
			server.ws.clients.forEach(function each(client){
				if (client.readyState === 1) {		//WebSocket.OPEN should be 1
					if (typeof data === "object"){
						client.send(JSON.stringify(data));
					}else{
						client.send(data);
					}
				}
			});
		}
	}

	//Run the server
	ClexiServer.start = function(){
		server.listen(port, hostname, function(err, address){
			if (err){
				server.log.error(err);
				process.exit(1);
			}
			console.log(`Server running at: ${address}`);
			console.log(`Hostname: ${hostname} - SSL: ${settings.ssl}`);
			server.log.info(`Server running at ${address}`);
			
			//Websocket interface
			server.ws.on('connection', function(socket){
				server.log.info('Client connected.');
				
				//CLIENT INPUT
				socket.on('message', function(msg){
					let msgObj = JSON.parse(msg);
					
					//Handle extensions input
					if (msgObj.type && xtensions[msgObj.type]){
						server.log.info('Calling xtensions: ' + msgObj.type);
						let response = xtensions[msgObj.type].input(msgObj, socket);
						socket.send(JSON.stringify({
							response: response,
							type: msgObj.type,
							id: msgObj.id
						}));
						
					//Welcome
					}else if (msgObj.type && msgObj.type == "welcome"){
						socket.send(JSON.stringify({
							type: "welcome",
							info: {
								version: ("CLEXI Node.js server v" + version),
								xtensions: getXtensionsInfo()
							}
						}));
					
					//undefined
					}else{
						socket.send(JSON.stringify({
							response: ("Unknown message type: " + msgObj.type),
							type: "undefined"
						}));
					}
				});
				
				socket.on('close', function(){
					server.log.info('Client disconnected.');
				});
				
				socket.on('error', function(e){
					server.log.error(`Client error: ${e.message}`);
				});
			});
			
			//Load extensions
			loadXtensions();
		});
	}
	
	ClexiServer.stop = server.close;
	
	return ClexiServer;
}

//Run server when called directly
if (require.main === module){
    Clexi().start();
}

module.exports = Clexi;