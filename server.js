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

var Session = {
	get: function (hostname, cb) {
		chrome.storage.local.get(hostname, function (session) {
			// create a default session if it doesn't exists
			if (!session[hostname]) {
				session[hostname] = {
					prefs: {
						jobTypeId: null,
						billable: false,
						roundingInterval: 0,
						minimumEntry: 0
					}
				};
				Session.save(hostname, session[hostname], function () { cb(session[hostname]); });
			}
			// or return the existing one
			else {
				cb(session[hostname]);
			}
		});
	},
	save: function (hostname, session, cb) {
		var data = {}; data[hostname] = session;
		chrome.storage.local.set(data, cb);
	}
};

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
		var self = this;
		Session.get(request.hostname, function (session) {
			self._handlers.forEach(function (handler, i, handlers) {
				if (handler.action == request.action) {
					if (typeof handler.cb === 'function') handler.cb(request, respond, session);
				}
			});
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
		if (!Number.isInteger(project) || !Number.isInteger(task)) {
			throw new Error('project and task must be an integer');
		}
		var result = null;
		timers.some(function (timer) {
			if (timer.project == project && timer.task == task) {
				result = timer;
				return true;
			}
		});
		if (result === null) {
			var result = {
				project: project, task: task, state: 'stopped', total: 0, start: 0, jobTypeId: null, billable: null, summary: ''
			};
			timers.push(result);
		}
		return result;
	};

	function getDefaultJobTypeId (jobTypes) {
		var defaultJobTypeId = null;
		jobTypes.forEach(function (jobType) {
			if (defaultJobTypeId == null || jobType.id < defaultJobTypeId) {
				defaultJobTypeId = jobType.id;
			}
		});
		return defaultJobTypeId;
	}

	function setTimerTimeFromString (timer, timeString) {

		var split = timeString.split(':');

		if (split.length != 2) return false;

		var hours = parseInt(split[0]);
		var mins = parseInt(split[1]);

		if (isNaN(hours) || isNaN(mins)) return false;
		if (hours > 23) return false;
		if (mins > 59) return false;

		var d = new Date(0);
		d.setUTCHours(hours);
		d.setUTCMinutes(mins);

		if (timer.state == 'stopped') {
			timer.total = d.getTime();
			timer.start = Date.now();
			timer.state = 'paused';
		}
		else if (timer.state == 'paused') {
			timer.total = d.getTime();
		}
		else if (timer.state == 'running') {
			timer.total = d.getTime();
			timer.start = Date.now();
		}

		return true;
	}

	Clients.on('getExtensionUrl', function (request, respond) {
		respond({ url: chrome.extension.getURL('') });
	});

	Clients.on('sendJobTypes', function (request, respond, session) {
		session.jobTypes = request.payload.jobTypes;
		session.prefs.jobTypeId = getDefaultJobTypeId(session.jobTypes);
		Session.save(request.hostname, session, function () {
			respond({ thank: 'you :)' });
		});
	});

	Clients.on('getPrefs', function (request, respond, session) {
		respond({ prefs: session.prefs });
	});

	Clients.on('updateMe', function (request, respond, session) {
		if (!session.timers) {
			session.timers = [];
			Session.save(request.hostname, session, function () {
				respond({ timers: session.timers });
			});
		}
		else {
			respond({ timers: session.timers });
		}
	});

	Clients.on('getMenuProps', function (request, respond, session) {
		var timer = getTimer(session.timers, request.payload.project, request.payload.task);
		respond({
			jobTypeId: timer.jobTypeId !== null ? timer.jobTypeId : session.prefs.jobTypeId,
			billable: timer.billable !== null ? timer.billable : session.prefs.billable,
			formattedTime: utils.formattedTime(timer, 0, 0),
			summary: timer.summary
		});
	});

	Clients.on('timerClicked', function (request, respond, session) {

		var timer = getTimer(session.timers, request.payload.project, request.payload.task);

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

		Session.save(request.hostname, session, function () {
			Clients.broadcast('update', { timers: session.timers });
		});
	});

	Clients.on('timerSetJobType', function (request, respond, session) {
		var timer = getTimer(session.timers, request.payload.project, request.payload.task);
		timer.jobTypeId = request.payload.value;
		Session.save(request.hostname, session, function () {
			Clients.broadcast('update', { timers: session.timers });
		});
	});

	Clients.on('timerSetBillable', function (request, respond, session) {
		var timer = getTimer(session.timers, request.payload.project, request.payload.task);
		timer.billable = request.payload.value;
		Session.save(request.hostname, session, function () {
			Clients.broadcast('update', { timers: session.timers });
		});
	});

	Clients.on('timerSetTime', function (request, respond, session) {
		var timer = getTimer(session.timers, request.payload.project, request.payload.task);
		respond({ valid: setTimerTimeFromString(timer, request.payload.value) });
		Session.save(request.hostname, session, function () {
			Clients.broadcast('update', { timers: session.timers });
		});
	});

	Clients.on('timerSetSummary', function (request, respond, session) {
		var timer = getTimer(session.timers, request.payload.project, request.payload.task);
		timer.summary = request.payload.value;
		Session.save(request.hostname, session, function () {
			Clients.broadcast('update', { timers: session.timers });
		});
	});

	Clients.on('timerStop', function (request, respond, session) {
		var timer = getTimer(session.timers, request.payload.project, request.payload.task);
		timer.state = 'stopped';
		timer.total = 0;
		timer.summary = '';
		Session.save(request.hostname, session, function () {
			Clients.broadcast('update', { timers: session.timers });
		});
	});

	Clients.on('timerSubmittableData', function (request, respond, session) {
		var timer = getTimer(session.timers, request.payload.project, request.payload.task);
		respond({
			billable_status: timer.billable !== null ? timer.billable : session.prefs.billable,
			job_type_id: timer.jobTypeId !== null ? timer.jobTypeId : session.prefs.jobTypeId,
			record_date: utils.activeCollabDateString(new Date()),
			summary: timer.summary,
			task_id: timer.task,
			value: utils.formattedTime(timer, session.prefs.roundingInterval, session.prefs.minimumEntry, true)
		});
	});

	Clients.on('timerSubmitted', function (request, respond, session) {
		var timer = getTimer(session.timers, request.payload.project, request.payload.task);
		timer.state = 'stopped';
		timer.total = 0;
		timer.summary = '';
		Session.save(request.hostname, session, function () {
			Clients.broadcast('update', { timers: session.timers });
			respond({});
		});
	});

});
