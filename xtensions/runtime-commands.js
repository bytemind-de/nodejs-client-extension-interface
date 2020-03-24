const exec = require('child_process').exec;
const fs = require('fs');

/**
* An extension that supports certain runtime commands like 'reboot' and 'shutdown'.
*/	
RuntimeCommands = function(onStartCallback, onEventCallback, onErrorCallback){
	//Commands accessible by this extension
	var availableCommands = {
		shutdown: shutdown,
		reboot: reboot,
		freeMemory: freeMemory,
		removeScheduled: removeScheduled,
		callCustom: callCustom
	}
	
	var globalTimeout = 15000; 	//15s
	var globalOptions = {
		timeout: globalTimeout,
		windowsHide: true
	};
	var delayedExecutions = {};
	
	//Platform
	function isWindows(){
		return (process.platform === "win32");
	}
	function isMac(){
		return (process.platform === "darwin");
	}
	function isLinux(){
		return (process.platform === "linux");
	}
	
	//Shutdown OS
	function shutdown(cmdId, arguments, successCallback, errorCallback){
		var convertFun = function(res){ return res; };
		var cmd;
		var delay = arguments.delay || 5000;
		//Linux
		if (isLinux()){
			cmd = "shutdown -h now";	//TODO: requires sudo
		//Windows
		}else if (isWindows()){
			cmd = "shutdown /s";		//TODO: untested
		}
		callExecuteDelayed(cmdId, delay, cmd, convertFun, globalOptions, successCallback, errorCallback);
	}
	
	//Reboot OS
	function reboot(cmdId, arguments, successCallback, errorCallback){
		var convertFun = function(res){ return res; };
		var cmd;
		var delay = arguments.delay || 5000;
		//Linux
		if (isLinux()){
			cmd = "reboot";				//TODO: requires sudo
		//Windows
		}else if (isWindows()){
			cmd = "shutdown /r";		//TODO: untested
		}
		callExecuteDelayed(cmdId, delay, cmd, convertFun, globalOptions, successCallback, errorCallback);
	}
	
	//Get free memory
	function freeMemory(cmdId, arguments, successCallback, errorCallback){
		var convertFun;
		var cmd;
		//Linux
		if (isLinux()){
			cmd = "free -h | grep Mem: | awk '{print $7}'"; 	//typical answer: 158Mi
			convertFun = function(res){
				return res.replace("Mi", " MB").replace(/(\r\n|\r|\n)+/g, " ").replace(/\s+/g, " ").trim();
			}
		//Windows
		}else if (isWindows()){
			cmd = "wmic OS get FreePhysicalMemory /Value"; 		//typical answer: FreePhysicalMemory=4176328
			convertFun = function(res){
				res = parseInt(res.replace("FreePhysicalMemory=", "").replace(/(\r\n|\r|\n)+/g, " "));
				return (res/1024 + " MB");
			}
		}
		if (arguments.delay){
			callExecuteDelayed(cmdId, arguments.delay, cmd, convertFun, globalOptions, successCallback, errorCallback);
		}else{
			callExecute(cmdId, cmd, convertFun, globalOptions, successCallback, errorCallback);
		}
	}
	
	//Remove a delayed/scheduled command
	function removeScheduled(cmdId, arguments, successCallback, errorCallback){
		if (arguments.cmdId && delayedExecutions[arguments.cmdId]){
			clearTimeout(delayedExecutions[arguments.cmdId]);
			successCallback("done", 200);
		}else{
			successCallback("no cmd with ID was scheduled", 204);
		}
	}
	
	//Call a script in default folder ../runtime_commands
	function callCustom(cmdId, arguments, successCallback, errorCallback){
		//build script path
		var path = "runtime_commands/" + arguments.file;
		if (path.indexOf(".") <= 0){
			if (isLinux()){
				//.linux
				path += ".linux";
			}else if (isWindows()){
				//.windows
				path += ".windows";
			}else if (isMac()){
				//.mac
				path += ".mac";
			}
		}
		//check if script exists
		var cmd;
		if (arguments.file && fs.existsSync(path)){
			cmd = fs.readFileSync(path, 'utf8');		//the content is supposed to be small so we use sync.
		}
		if (cmd){
			//check variables
			var variables = cmd.match(/\${.*?}/g);
			if (variables && variables.length > 0){
				for (var i=0; i<variables.length; i++){
					var k = variables[i].substring(2, variables[i].length-1);
					cmd = cmd.replace(new RegExp("\\${" + k + "}", "g"), "'" + arguments[k] + "'");
				}
			}
			var convertFun = function(res){ return res.replace(/(\r\n|\r|\n)+$/, "").trim(); };	//no conversion just remove last line-break
			if (arguments.delay){
				callExecuteDelayed(cmdId, arguments.delay, cmd, convertFun, globalOptions, successCallback, errorCallback);
			}else{
				callExecute(cmdId, cmd, convertFun, globalOptions, successCallback, errorCallback);
			}
		//not found
		}else{
			errorCallback("runtime command with path '" + path + "' not found or empty", 404);
		}
	}
	
	//----------------------------------------------
	
	//Execute runtime commands
	function executeCommand(cmd, cmdId, arguments){
		var fun = availableCommands[cmd];
		if (!fun){
			if (onErrorCallback) onErrorCallback({
				error: {
					msg: "command not found",
					code: 404,
					cmd: cmd,
					cmdId: cmdId
				}
			});
			return 
		}else{
			//Success
			var successCallback = function(result, code){
				//console.log(`result: ${result}`);		//DEBUG
				if (onEventCallback) onEventCallback({
					data: {
						result: result,
						code: code || 200,
						cmd: cmd,
						cmdId: cmdId
					}
				});
			}
			//Fail
			var errorCallback = function(err, code){
				//console.error(`error: ${err}`);		//DEBUG
				if (onErrorCallback) onErrorCallback({
					error: {
						msg: err,
						code: code || 500,
						cmd: cmd,
						cmdId: cmdId
					}
				});
			}
			try{
				fun(cmdId, arguments, successCallback, errorCallback);
			}catch (err){
				//Error
				if (onErrorCallback) onErrorCallback({
					error: {
						msg: err,
						code: 500,
						cmd: cmd,
						cmdId: cmdId
					}
				});
			}
		}
	}
	function callExecute(cmdId, cmd, convertFun, globalOptions, successCallback, errorCallback){
		if (delayedExecutions[cmdId]) clearTimeout(delayedExecutions[cmdId]);
		if (cmd && convertFun){
			exec(cmd, globalOptions, function(error, stdout, stderr){
				var err = error || stderr;
				if (err){
					if (errorCallback) errorCallback(err);
				}else{
					if (successCallback) successCallback(convertFun(stdout));
				}
			});
		}else{
			if (errorCallback) errorCallback("not yet supported by this OS", 501);
		}
	}
	function callExecuteDelayed(cmdId, delay, cmd, convertFun, globalOptions, successCallback, errorCallback){
		if (successCallback) successCallback("request sent", 202);
		if (delayedExecutions[cmdId]) clearTimeout(delayedExecutions[cmdId]);
		delayedExecutions[cmdId] = setTimeout(callExecute, delay, cmdId, cmd, convertFun, globalOptions, successCallback, errorCallback);
	}
		
	//Input
	this.input = function(msg, socket){
		//console.log(JSON.stringify(msg, null, '  '));
		var cmdData = msg.data;
		if (cmdData && cmdData.id && cmdData.cmd){
			executeCommand(cmdData.cmd, cmdData.id, cmdData.args);
			return "sent";
		}else{
			return "sent but invalid";
		}
	}
	
	//On start
	if (onStartCallback) onStartCallback({
		msg: "Runtime-Commands initialized."
	});
};

module.exports = RuntimeCommands;