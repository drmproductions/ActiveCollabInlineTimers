console.log('server.js loaded!');

var prefs = {};

function require (urls, cb) {
	if (!Array.isArray(urls) && typeof urls === 'string') urls = [urls];
	var modules = [];
	var i = 0, next = function () {
		fetch(urls[i])
			.then(function (response) {
				return response.text();
			})
			.then(function (code) {
				try {
					var module = eval('(function () { var module = { exports: {} }; (function() { ' + code + ' })(); return module.exports; })();');
					modules.push(module);
					if (++i == urls.length) {
						cb.apply(this, modules);
					}
					else {
						next();
					}
				}
				catch (e) {
					console.error(e);
				}
			})
			.catch(function (ex) {
				console.error(ex);
			});
	};
	next();
}

var Clients = {
	_handlers: [],
	_genId: function (len) {
		var id = "", c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for (var i = 0; i < len; i++) id += c.charAt(Math.floor(Math.random() * c.length));
		return id;
	},
	// adds a client request handler
	on: function (action, cb) {
		this._handlers.push({ id: this._genId(32), action: action, cb: cb });
	},
	// sends a request to all the clients
	broadcast: function (action, payload) {
		chrome.tabs.query({}, function (tabs) {
			for (var i = 0; i < tabs.length; ++i) {
				chrome.tabs.sendMessage(tabs[i].id, {
					from: 'SERVER',
					action: action,
					payload: payload
				});
			}
		});
	},
	dispatchOnHandlers: function (request, respond) {
		this._handlers.forEach(function (handler, i, handlers) {
			if (handler.action == request.action) {
				if (typeof handler.cb === 'function') handler.cb(request, respond);
			}
		});
	},
	setup: function () {
		var self = this;
		// listens for actions coming from the clients, does stuff, then responds to them
		chrome.runtime.onMessage.addListener(function (request, sender, respond) {
			if (!request || !request.id || !request.action || !request.hostname || !request.payload) return;
			if (request.from !== 'CLIENT_EXTERNAL' && request.from !== 'POPUP') return;
			self.dispatchOnHandlers(request, function (payload) {
				respond({ from: 'SERVER', id: request.id, action: request.action, payload: payload });
			});
			return true;
		});
	}
};

Clients.setup();

require(chrome.extension.getURL('utils.js'), function (utils) {

	function getTimer (timers, project, task) {
		var result = null;
		timers.some(function (timer) {
			if (timer.project == project && timer.task == task) {
				result = timer;
				return true;
			}
		});
		return result;
	};

	function getSession (hostname, cb) {
		chrome.storage.local.get(hostname, function (session) {
			if (!session[hostname]) {
				saveSession(hostname, {}, function () {
					cb({});
				});
			}
			else {
				cb(session[hostname]);
			}
		});
	}

	function saveSession (hostname, session, cb) {
		var data = {}; data[hostname] = session;
		chrome.storage.local.set(data, cb);
	}

	Clients.on('getExtensionUrl', function (request, respond) {
		respond({ url: chrome.extension.getURL('') });
	});

	Clients.on('sendJobTypes', function (request, respond) {
		getSession(request.hostname, function (session) {
			session.jobTypes = request.payload.jobTypes;
			saveSession(request.hostname, session, function () {
				respond({ thank: 'you :)' });
			});
		});
	});

	Clients.on('getPrefs', function (request, respond) {
		getSession(request.hostname, function (session) {
			respond({ prefs: session.prefs });
		});
	});

	Clients.on('updateMe', function (request, respond) {
		getSession(request.hostname, function (session) {

			if (!session.timers) {
				session.timers = [];
				saveSession(request.hostname, session, function () {
					respond({ timers: session.timers });
				});
			}
			else {
				respond({ timers: session.timers });
			}

			// create any new timers they tell us about in their update request
			/*request.payload.timers.forEach(function (timer) {
				if (!getTimer(session.timers, timer.project, timer.task)) {
					sessionNeedsSaved = true;
					session.timers.push({ project: timer.project, task: timer.task, state: 'stopped', total: 0, start: 0 });
				}
			});*/
		});
	});

	Clients.on('timerClicked', function (request, respond) {
		getSession(request.hostname, function (session) {

			var timer = getTimer(session.timers, request.payload.project, request.payload.task);

			if (!timer) {
				timer = { project: request.payload.project, task: request.payload.task, state: 'stopped', total: 0, start: 0 }
				session.timers.push(timer);
			}

			if (timer.state == 'paused' || timer.state == 'stopped') {
				// pause all the running timers
				session.timers.forEach(function (t) {
					if (t.state == 'running') {
						t.total += Date.now() - t.start;
						t.state = 'paused';
					}
				});
				// start this timer
				timer.start = Date.now();
				timer.state = 'running';
			}
			else if (timer.state == 'running') {
				timer.total += Date.now() - timer.start;
				timer.state = 'paused';
			}

			saveSession(request.hostname, session, function () {
				// tell all the clients about the update
				Clients.broadcast('update', { timers: session.timers });
			});
		});
	});

});
