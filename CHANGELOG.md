# Changelog for CLEXI - Client Extension Interface

## v0.8.2
* Added 'runtime-commands' extension and folder (beta, deactivated by default)
* Updated client lib to support 'onWelcome' event as Clexi.connect callback
* If 'idIsPassword' is 'true' the server will no longer show its ID at the welcome event

## v0.8.1
* Added settings option 'idIsPassword' and implemented server checks to validated ID during welcome event
* Improved client lib to handle new authentication process and added new method to call 'http-events' endpoint
* Improved 'run' script and added 'shutdown' and 'status' scripts (Linux)

## v0.8.0
* Added 'clexi-http-events' extension and 'event' server endpoint
* Added server ID and 'ping' endpoint to request it (can be used to identify a certain server)
* If `ClexiJS.serverId` is set the client will check if its identical with the server and close the connection of necessary
* Extension events will now be activated AFTER the 'welcome' event
* Added `ClexiJS.pingAndConnect` function to ping server before connecting

## v0.7.1
* Fixed a bug in client auto-reconnect after close request
* Added onConnecting callback to client library
* Updated installation info

## v0.7.0
* First major release with stable server and client library

## v0.6.x
* Work in progress/test release