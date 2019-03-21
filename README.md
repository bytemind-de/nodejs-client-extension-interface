# Node.js CLEXI
Node.js CLEXI is a lightweight **cl**ient **ex**tension **i**nterface that enhances connected clients with functions of the underlying operating system using a duplex, realtime Websocket connection (e.g. Bluetooth beacon scanning).

## Raspberry Pi 3 installation

Requirements:  
* Node.js (tested with 9.11.2)
* Some Linux packages: `sudo apt-get install bluetooth bluez libbluetooth-dev libudev-dev libnss3-tools libcap2-bin openssl`
* SSL certificates for HTTPS (you can use the included script to generate self-signed)
  
Clone the repository to the folder 'clexi' and enter that folder:  
```
git clone https://github.com/bytemind-de/nodejs-client-extension-interface.git clexi
cd clexi
```  
Decide which hostname you want to use for your server. Default is `localhost` but I usually prefer `raspberrypi.local` (default hostname of RPi) to make CLEXI available to all devices in the network.  
You can change your hostname via the raspi-config tool.
Now generate some self-signed SSL certificates for your CLEXI server:  
```
sh generate_ssl_cert.sh
```  
The tool will ask you for some info. By pressing RETURN you can keep most of the default values, just for `common name` choose your hostname (or 'localhost').  
Next step is to adjust the CLEXI settings. Use a text editor of your choice, I prefer nano:
```
nano settings.json
```  
Here you can change the default port of your server and set the hostname to the SAME name you used for the SSL certificate (e.g. raspberrypi.local). This is important because you might not be able to reach the server otherwhise.  
Now you can run your server :-)  
```
sudo node server.js
```  
You should see a confirmation that the server is running and that extensions have been loaded (and hopefully no error ^^).  
The `sudo` command is required for Bluetooth control. If you want to run the server without sudo you have to grant the node binary cap_net_raw privileges:  
```
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
```  
  
## Client installation

### Clexi.js for browsers

Copy latest Clexi.js library from this repository and include it in your page head:
```
<script type="text/javascript" src="lib/clexi-0.7.0.js" charset="UTF-8"></script>
```
Make sure your server is running and reachable, then connect like this:
```
var hostURL = "wss://raspberrypi.local:8443";
  
ClexiJS.subscribeTo('ble-beacon-scanner', function(e){
	console.log('BLE Beacon event: ' + JSON.stringify(e));
}, function(e){
	console.log('BLE Beacon response: ' + JSON.stringify(e));
}, function(e){
	console.log('BLE Beacon error: ' + JSON.stringify(e));
});
  
ClexiJS.connect(hostURL, function(e){
	console.log('connected');
}, function(e){
	console.log('closed');
}, function(err){
	console.log('error');
});
```
  
For more examples check the `www` folder of this repository.