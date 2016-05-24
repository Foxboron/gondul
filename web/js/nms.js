"use strict";

/*
 * This is the original nms.js and it's a bit of a mess as much has been
 * moved into separate js-files and cleaned up.
 *
 * Gradual refactoring has begun.
 *
 * On the TODO list:
 *
 * - Move all pure UI stuff into nmsUi: nightMode, vertical mode,
 *   menushowing,
 * - Get rid of "tvmode". As in: complete the merge
 * - Move all time-travel related code out into a separate entity.
 * - Remove nms.now: it belongs in nmsData.
 * - nms.timers probably also deserves to die. It used to do a lot more,
 *   now it's just leftovers.
 */
var nms = {
	stats:{}, // Various internal stats
	get nightMode() { return this._nightMode; },
	set nightMode(val) { if (val != this._nightMode) { this._nightMode = val; setNightMode(val); } },
	/*
	 * FIXME: This should be slightly smarter.
	 */
	_now: false,
	get now() { return this._now },
	set now(v) { this._now = v; nmsData.now = v; },
	/*
	 * Various setInterval() handlers. See nmsTimer() for how they are
	 * used.
	 *
	 * FIXME: Should just stop using these.
	 */
	timers: {
		playback:false,
		tvmode: false
	},
	
	menuShowing:true,
	_startTime:0,
	get uptime() {
		return (Date.now() - this._startTime)/1000;
	},
	_vertical: 0,
	get vertical() { return this._vertical },
	set vertical(v) {
		this._vertical = v;
		if(v)
			document.body.classList.add("vertical");
		else
			document.body.classList.remove("vertical");
		saveSettings();
	},

	interval: 10,
	views: "ping",
	/*
	 * This is a list of nms[x] variables that we store in our
	 * settings-cookie when altered and restore on load.
	 */
	settingsList:[
		'nightMode',
		'menuShowing',
		'vertical',
		'views',
		'interval'
	],
	keyBindings:{
		'-':toggleMenu,
		'n':toggleNightMode,
		'1':setMapModeFromN,
		'2':setMapModeFromN,
		'3':setMapModeFromN,
		'4':setMapModeFromN,
		'5':setMapModeFromN,
		'6':setMapModeFromN,
		'7':setMapModeFromN,
		'8':setMapModeFromN,
		'9':setMapModeFromN,
		'c':toggleConnect,
		'h':moveTimeFromKey,
		'j':moveTimeFromKey,
		'k':moveTimeFromKey,
		'l':moveTimeFromKey,
		'p':moveTimeFromKey,
		'r':moveTimeFromKey,
		'Escape':hideWindow,
		'?':toggleHelp
	},
	/*
	 * Playback controllers and variables
	 */
	playback:{
		startTime: false,
		stopTime: false,
		playing: false,
		replayTime: 0,
		replayIncrement: 60 * 60
	},
	tvmode: {
		handlers: [],
		currentIndex: 0,
		interval: 20000,
		active: false,
		vertical: false
	}
};

/*
 * Returns a handler object.
 *
 * This might seem a bit much for 'setInterval()' etc, but it's really more
 * about self-documentation and predictable ways of configuring timers.
 */
function nmsTimer(handler, interval, name, description) {
	this.handler = handler;
	this.handle = false;
	this.interval = parseInt(interval);
	this.name = name;
	this.description = description;
	this.start = function() { 
		if (this.handle) {
			this.stop();
		}
		this.handle = setInterval(this.handler,this.interval);
		};
	this.stop = function() { 
		if (this.handle)
			clearInterval(this.handle);
			this.handle = false;
		};

	this.setInterval = function(interval) {
		var started = this.handle != false;
		this.stop();
		this.interval = parseInt(interval);
		if (started)
			this.start();
	};
}


/*
 * Convenience function that doesn't support huge numbers, and it's easier
 * to comment than to fix. But not really, but I'm not fixing it anyway.
 */
function byteCount(bytes,precision) {
	if (precision ==undefined)
		precision = 1;
	var units = ['', 'K', 'M', 'G', 'T', 'P'];
	var i = 0;
	while (bytes > 1024) {
		bytes = bytes / 1024;
		i++;
	}
	return bytes.toFixed(precision) + units[i];
}

/*
 * Definitely not a way to toggle night mode. Does something COMPLETELY
 * DIFFERENT.
 */
function toggleNightMode()
{
	nms.nightMode = !nms.nightMode;
	saveSettings();
}

/*
 * Parse 'now' from user-input.
 *
 * Should probably just use stringToEpoch() instead, but alas, not yet.
 */
function parseNow(now)
{
	if (Date.parse(now)) {
		// Adjust for timezone when converting from epoch (UTC) to string (local)
		var d = new Date(now);
		var timezoneOffset = d.getTimezoneOffset() * -60000;
		var d = new Date(Date.parse(now) - timezoneOffset);
		var str = d.getFullYear() + "-" + ("00" + (parseInt(d.getMonth())+1)).slice(-2) + "-" + ("00" + d.getDate()).slice(-2) + "T";
		str += ("00" + d.getHours()).slice(-2) + ":" + ("00" + d.getMinutes()).slice(-2) + ":" + ("00" + d.getSeconds()).slice(-2);
		return str;

	}
	if (now == "")
		return "";
	return false;
}

/*
 * Convert back and forth between epoch.
 *
 * There's no particular reason why I use seconds instead of javascript
 * microseconds, except to leave the mark of a C coder on this javascript
 * project.
 */
function stringToEpoch(t)
{
	var foo = t.toString();
//	foo = foo.replace('T',' ');
	var ret = new Date(Date.parse(foo));
	return parseInt(parseInt(ret.valueOf()) / 1000);
}

/*
 * Have to pad with zeroes to avoid "17:5:0" instead of the conventional
 * and more readable "17:05:00". I'm sure there's a better way, but this
 * works just fine.
 */
function epochToString(t)
{
	// Adjust for timezone when converting from epoch (UTC) to string (local)
	var date = new Date(parseInt(t) * parseInt(1000));
	var timezoneOffset = date.getTimezoneOffset() * -60;
	t = t - timezoneOffset;

    date = new Date(parseInt(t) * parseInt(1000));
	var str = date.getFullYear() + "-";
	if (parseInt(date.getMonth()) < 9)
		str += "0";
	str += (parseInt(date.getMonth())+1) + "-";
	if (date.getDate() < 10)
		str += "0";
	str += date.getDate() + "T";
	if (date.getHours() < 10)
		str += "0";
	str += date.getHours() + ":";
	if (date.getMinutes() < 10)
		str += "0";
	str += date.getMinutes() + ":";
	if (date.getSeconds() < 10)
		str += "0";
	str += date.getSeconds();

	return str;
}

function localEpochToString(t) {
	var d = new Date(parseInt(t) * parseInt(1000));
	var timezoneOffset = d.getTimezoneOffset() * -60;
	t = t + timezoneOffset;

	return epochToString(t);
}

/*
 * Start replaying historical data.
 */
nms.playback.startReplay = function(startTime,stopTime) {
	if(!startTime || !stopTime)
		return false;

	nms.playback.pause();
	nms.playback.startTime = stringToEpoch(startTime);
	nms.playback.stopTime = stringToEpoch(stopTime);
	nms.now = epochToString(nms.playback.startTime);
	nms.playback.play();
};

/*
 * Pause playback
 */
nms.playback.pause = function() {
	nms.timers.playback.stop();
	nms.playback.playing = false;
};

/*
 * Start playback
 */
nms.playback.play = function() {
	nms.playback.tick();
	nms.timers.playback.start();
	nms.playback.playing = true;
};

/*
 * Toggle playback
 */
nms.playback.toggle = function() {
	if(nms.playback.playing) {
		nms.playback.pause();
	} else {
		nms.playback.play();
	}
};

/*
 * Jump to place in time
 */
nms.playback.setNow = function(now) {
	nms.now = parseNow(now);

	nms.playback.stopTime = false;
	nms.playback.startTime = false;
	nms.playback.tick();
};

/*
 * Step forwards or backwards in timer
 */
nms.playback.stepTime = function(n)
{
	var now = getNowEpoch();
	var newtime = parseInt(now) + parseInt(n);
	nms.now = epochToString(parseInt(newtime));

	if(!nms.playback.playing)
		nms.playback.tick();
};

/*
 * Ticker to trigger updates, and advance time if replaying
 *
 * This is run on a timer (nms.timers.tick) every second while unpaused
 */
nms.playback.tick = function()
{
	nms.playback.replayTime = getNowEpoch();

	// If outside start-/stopTime, remove limits and pause playback
	if (nms.playback.stopTime && (nms.playback.replayTime >= nms.playback.stopTime || nms.playback.replayTime < nms.playback.startTime)) {
		nms.playback.stopTime = false;
		nms.playback.startTime = false;
		nms.playback.pause();
		return;
	}

	// If past actual datetime, go live
	if (nms.playback.replayTime > parseInt(Date.now() / 1000)) {
		nms.now = false;
	}

	// If we are still replaying, advance time
	if(nms.now !== false && nms.playback.playing) {
		nms.playback.stepTime(nms.playback.replayIncrement);
	}
};

/*
 * Helper function for safely getting a valid now-epoch
 */
function getNowEpoch() {
	if (nms.now && nms.now != 0)
		return stringToEpoch(nms.now);
	else
		return parseInt(Date.now() / 1000);
}

/*
 * There are 4 legend-bars. This is a helper-function to set the color and
 * description/name for each one. Used from handler init-functions.
 *
 * FIXME: Should be smarter, possibly use a canvas-writer so we can get
 * proper text (e.g.: not black text on dark blue). 
 */
function setLegend(x,color,name)
{
	var el = document.getElementById("legend-" + x);
	el.style.background = color;
	el.title = name;
	el.textContent = name;
	if (name == "") {
		el.style.display = 'none';
	} else {
		el.style.display = '';
	}
}

/*
 * Start TV-mode
 *
 * Loops trough a list of views/updaters at a set interval.
 * Arguments: array of views, interval in seconds, use nightmode, hide menus
 */
nms.tvmode.start = function(views,interval) {
	nms.tvmode.handlers = [];
	for(var view in views) {
		for(var handler in handlers) {
			if(views[view] == handlers[handler].tag) {
				nms.tvmode.handlers.push(handlers[handler]);
			}
		}
	}
	if (nms.tvmode.handlers.length > 1) {
		if(interval > 0)
			nms.tvmode.interval = interval * 1000;
		nms.timers.tvmode = new nmsTimer(nms.tvmode.tick, nms.tvmode.interval, "TV-mode ticker", "Handler used to advance tv-mode");
		nms.timers.tvmode.start();
		nms.tvmode.tick();
		nms.tvmode.active = true;
	}
}
nms.tvmode.tick = function() {
	if(nms.tvmode.currentIndex > nms.tvmode.handlers.length - 1) {
		nms.tvmode.currentIndex = 0;
	}
	setUpdater(nms.tvmode.handlers[nms.tvmode.currentIndex]);
	nms.tvmode.currentIndex++;
}
nms.tvmode.stop = function() {
	nms.timers.tvmode.stop();
	document.body.classList.remove("tvmode");
	document.body.classList.remove("vertical");
	nms.tvmode.active = false;
}

/*
 * Change map handler (e.g., change from uplink map to ping map)
 */
function setUpdater(fo)
{
	nmsMap.reset();
	nmsData.unregisterHandlerWildcard("mapHandler");
	try {
		fo.init();
	} catch (e) {
		/*
		 * This can happen typically on initial load where the data
		 * hasn't been retrieved yet. Instead of breaking the
		 * entire init-process, just bail out here.
		 */
		console.log("Possibly broken handler: " + fo.name);
		console.log(e);
	}
	var foo = document.getElementById("map-mode-title");
	foo.innerHTML = fo.name;
	document.location.hash = fo.tag;
}

function toggleLayer(layer) {
       var l = document.getElementById(layer);
       if (l.style.display == 'none')
               l.style.display = '';
       else
               l.style.display = 'none';
}

function toggleConnect() {
	toggleLayer("linkCanvas");
}

/*
 * Returns true if the coordinates (x,y) is inside the box defined by
 * box.{x,y,w.h} (e.g.: placement of a switch).
 */
function isIn(box, x, y)
{
    return ((x >= box.x) && (x <= (box.x + box.width)) && (y >= box.y) && (y <= (box.y + box.height)));
}

/*
 * Return the name of the switch found at coordinates (x,y), or 'undefined'
 * if none is found.
 *
 * FIXME: this belongs in nmsMap.
 */
function findSwitch(x,y) {
	x = parseInt(parseInt(x) / nmsMap.scale);
	y = parseInt(parseInt(y) / nmsMap.scale);

	for (var v in nmsData.switches.switches) {
		if(isIn(nmsData.switches.switches[v]['placement'],x,y)) {
			return v;
		}
	}
	return undefined;
}

/*
 * Set night mode to whatever 'toggle' is.
 *
 * Changes background and nav-bar, then leaves the rest to nmsMap.
 */
function setNightMode(toggle) {
	nms.nightMode = toggle;
	var body = document.getElementById("body");
	body.style.background = toggle ? "black" : "white";
	var nav = document.getElementsByTagName("nav")[0];
	if (toggle) {
		nav.classList.add('navbar-inverse');
		document.body.classList.add("nightmode");
	} else {
		nav.classList.remove('navbar-inverse');
		document.body.classList.remove("nightmode");
	}
	nmsMap.setNightMode(toggle);
}

/*
 * Only used to fetch the initial config for anything that needs to be
 * handled prior to regular "boot up".
 *
 * For the moment, that only means detecting if we're being run on a public
 * vhost or not. This has to be done in synch because it affects what
 * sources we register for nmsData[]. If we wait for nmsData['config'],
 * it's too late because all other things have been initialized already.
 *
 * If you add a configuration setting, use nmsData['config'] as much as
 * possible. Avoid adding to this function.
 */
function getInitialConfig() {
	$.ajax({
		type: "GET",
		url: "/api/public/config",
		async: false,
		dataType: "json",
		success: function (data, textStatus, jqXHR) {
			if (data["config"]["public"] == "true") {
				nms._public = true;
				document.body.classList.add("gondul-public");
			} else {
				console.log("Private");
				nms._public = false;
				document.body.classList.add("gondul-private");
			}
		}
	});
}

/*
 * Boot up "fully fledged" NMS.
 *
 * This can be re-written to provide different looks and feels but using
 * the same framework. Or rather: that's the goal. We're not quite there
 * yet.
 */
function initNMS() {
	nms.timers.playback = new nmsTimer(nms.playback.tick, 1000, "Playback ticker", "Handler used to advance time");
	nms._startTime = Date.now();
	
	// Public
	nmsData.registerSource("config","/api/public/config");
	nmsData.registerSource("ping", "/api/public/ping");
	nmsData.registerSource("switches","/api/public/switches");
	nmsData.registerSource("switchstate","/api/public/switch-state");
	nmsData.registerSource("dhcpsummary","/api/public/dhcp-summary");
	nmsData.registerSource("dhcp","/api/public/dhcp");

	// Fetch initial config. Basically just populates nms._public.
	// All other settings are kept in nmsData['config'].
	getInitialConfig();

	// This is a magic dummy-source, it's purpose is to give a unified
	// way to get ticks every second. It is mainly meant to allow map
	// handlers to register for ticks so they will execute without data
	// (and thus notice stale data instead of showing a green ping-map
	// despite no pings)
	nmsData.registerSource("ticker","bananabananbanana");

	if (!nms._public) {
		// Private	
		nmsData.registerSource("snmp","/api/read/snmp");
		nmsData.registerSource("smanagement","/api/read/switches-management");
		nmsData.registerSource("oplog", "/api/read/oplog");
		nmsOplog.init();
	}

	restoreSettings();
	nmsMap.init();
	detectHandler();
	nms.playback.play();
	setupKeyhandler();
	nmsSearch.init();
}

function detectHandler() {
	var views = nms.views;
	var interval = nms.interval;
	views = views.split(",");
	
	if (views.length > 1) {
		nms.tvmode.start(views,interval);
	} else {
		var anchorviews = document.location.hash.slice(1);
		views = anchorviews.split(",");
		if (views.length > 1) {
			nms.tvmode.start(views,interval);
			return;
		} else {
			for (var i in handlers) {
				if (('#' + handlers[i].tag) == anchorviews) {
					setUpdater(handlers[i]);
					return;
				}
			}
		}
	}
	setUpdater(handler_ping);
}

function getUrlVars() {
	var vars = {};
	var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&#]*)/gi, function(m,key,value) {
		vars[key] = value;
	});
	return vars;
}

function setMenu()
{
	var nav = document.getElementsByTagName("nav")[0];
	nav.style.display = nms.menuShowing ? '' : 'none';
}

function toggleMenu()
{
	nms.menuShowing = ! nms.menuShowing;
	setMenu();
	saveSettings();
}
function hideWindow(e,key)
{
	nmsInfoBox.hide();
}
function toggleHelp(e,key) {
	toggleLayer('aboutKeybindings');
}

function setMapModeFromN(e,key)
{
	switch(key) {
		case '1':
			setUpdater(handler_ping);
			break;
		case '2':
			setUpdater(handler_uplinks);
			break;
		case '3':
			setUpdater(handler_dhcp);
			break;
		case '4':
			setUpdater(handler_combo);
			break;
		case '5':
			setUpdater(handler_temp);
			break;
		case '6':
			setUpdater(handler_traffic);
			break;
		case '7':
			setUpdater(handler_traffic_tot);
			break;
		case '8':
			setUpdater(handler_snmp);
			break;
		case '9':
			setUpdater(handler_disco);
			break;
	}
	return true;
}

function moveTimeFromKey(e,key)
{
	switch(key) {
		case 'h':
			nms.playback.stepTime(-3600);
			break;
		case 'j':
			nms.playback.stepTime(-300);
			break;
		case 'k':
			nms.playback.stepTime(300);
			break;
		case 'l':
			nms.playback.stepTime(3600);
			break;
		case 'p':
			nms.playback.toggle();
			break;
		case 'r':
			nms.playback.setNow();
			nms.playback.play();
			break;
	}
	return true;
}

function keyPressed(e)
{
	if (e.target.nodeName == "INPUT") {
		return false;
	}
	if(e.key) {
		var key = e.key;
	} else {
		var key = e.keyCode;
		switch(key) {
			case 187:
				key = '?';
				break;
			case 189:
				key = '-';
				break;
			case 27:
				key = 'Escape';
				break;
			default:
				key = String.fromCharCode(key);
				key = key.toLowerCase();
				break;
		}
	}
	if (nms.keyBindings[key])
		return nms.keyBindings[key](e,key);
	if (nms.keyBindings['default'])
		return nms.keyBindings['default'](e,key);
	return false;
}

function setupKeyhandler()
{
	var b = document.getElementsByTagName("body")[0];
	$( "body" ).keyup(function(e) {
		keyPressed(e);
	});
}


function getCookie(cname) {
	var name = cname + "=";
	var ca = document.cookie.split(';');
	for(var i=0; i<ca.length; i++) {
		var c = ca[i];
		while (c.charAt(0)==' ')
			c = c.substring(1);
		if (c.indexOf(name) == 0)
			return c.substring(name.length,c.length);
	}
	return "";
}

/*
 * Store relevant settings to a cookie.
 *
 * Also prints the value of the cookie on the console. This can then be
 * used as part of the URL instead.
 */
function saveSettings()
{
	var foo={};
	for ( var v in nms.settingsList ) {
		foo[ nms.settingsList[v] ] = nms[ nms.settingsList[v] ];
	}
	var string = btoa(JSON.stringify(foo));
	document.cookie = 'nms='+string;
	console.log("Add this to the URL to use these settings: nms="+string);
}

/*
 * Restore settings from a cookie or from the url, using the "GET
 * paramater" nms.
 * Url paramater overrides the cookie.
 */
function restoreSettings()
{
	try {
		var retrieve = JSON.parse(atob(getCookie("nms")));
	} catch(e) { 
	}
	try {
		var retrieve2 = getUrlVars()['nms'];
		if (retrieve2 != "") {
			retrieve = JSON.parse(atob(retrieve2));

		}
	} catch (e) {
	}

	for (var v in retrieve) {
		nms[v] = retrieve[v];
	}
	setMenu();
}

/*
 * Time travel gui
 */
function startNowPicker(now) {
	$.datetimepicker.setLocale('no');
	$('#nowPicker').datetimepicker('destroy');
	if(!now && nms.now)
		now = nms.now;
	var datepicker = $('#nowPicker').datetimepicker({
		value: now,
		mask:false,
		inline:true,
		todayButton: false,
		validateOnBlur:false,
		dayOfWeekStart:1,
		maxDate:'+1970/01/01',
		onSelectDate: function(ct,$i){
			document.getElementById('nowPicker').dataset.iso = localEpochToString(ct.valueOf()/1000);
		},
		onSelectTime: function(ct,$i){
			document.getElementById('nowPicker').dataset.iso = localEpochToString(ct.valueOf()/1000);
		},
		onGenerate: function(ct,$i){
			document.getElementById('nowPicker').dataset.iso = localEpochToString(ct.valueOf()/1000);
		}
	});
}
