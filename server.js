console.log('server.js loaded!');

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

require(chrome.extension.getURL('utils.js'), function (utils) {

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
		// adds a client request handler
		on: function (action, cb) {
			this._handlers.push({ action: action, cb: cb });
		},
		// emits message to a client
		emit: function (tabId, action, payload, cb) {

			var data = { from: 'SERVER', action: action, payload: payload };

			// send to a specific tab
			if (Number.isInteger(tabId)) {
				chrome.tabs.sendMessage(tabId, data, function (result) {
					cb(result);
				});
			}
			// send to the current tab
			else {
				utils.currentTab(function (tab) {
					chrome.tabs.sendMessage(tab.id, data, function (result) {
						cb(result);
					});
				});
			}
		},
		// sends a request to all the clients
		broadcast: function (action, payload, cb) {
			var data = { from: 'SERVER', action: action, payload: payload };
			chrome.tabs.query({}, function (tabs) {
				var i = 0, results = {}, next = function () {
					chrome.tabs.sendMessage(tabs[i].id, data, function (result) {
						results[tabs[i].id] = result;
						if (++i == tabs.length) {
							if (typeof cb === 'function') cb(results);
						}
						else {
							next();
						}
					});
				};
				next();
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
				if (!request || !request.action || !request.hostname || !request.payload) return;
				if (request.from !== 'CLIENT_EXTERNAL' && request.from !== 'POPUP') return;
				if (request.from === 'CLIENT_EXTERNAL' && !request.id) return;
				self.dispatchOnHandlers(request, function (payload) {
					try {
						respond({ from: 'SERVER', id: request.id, action: request.action, payload: payload });
					}
					catch (e) {
						console.log(e);
					}
				});
				return true;
			});
		}
	};

	Clients.setup();

	// returns this extensions url
	// used for including extension resources inside of page.js
	Clients.on('extension/get/url', function (request, respond) {
		respond({ url: chrome.extension.getURL('') });
	});

	// gets called when the client tells us about their jobTypes
	Clients.on('session/jobTypes/set', function (request, respond, session) {
		session.jobTypes = request.payload.jobTypes;
		session.prefs.jobTypeId = utils.getDefaultJobTypeId(session.jobTypes);
		Session.save(request.hostname, session, function () {
			respond({ thank: 'you :)' });
		});
	});

	// gets a preference from the session based on the requestees hostname
	Clients.on('session/prefs/get', function (request, respond, session) {
		respond({ prefs: session.prefs });
	});

	// sets a preference from the session based on the requestees hostname
	Clients.on('session/prefs/set', function (request, respond, session) {
		session.prefs[request.payload.key] = request.payload.value;
		Session.save(request.hostname, session, function () {
			respond({});
		});
	});

	// returns an object containing the data needed to render the menu for the passed in timer
	Clients.on('menu/content', function (request, respond, session) {
		var timer = utils.getTimer(session.timers, request.payload.project, request.payload.task);
		respond({
			jobTypeId: timer.jobTypeId !== null ? timer.jobTypeId : session.prefs.jobTypeId,
			billable: timer.billable !== null ? timer.billable : session.prefs.billable,
			formattedTime: utils.formattedTime(timer, 0, 0),
			summary: timer.summary
		});
	});

	// returns the content needed to fill the popup
	Clients.on('popup/content', function (request, respond, session) {
		respond({ prefs: session.prefs, jobTypes: session.jobTypes });
	});

	// gets called when a timer is clicked
	Clients.on('timer/clicked', function (request, respond, session) {

		var timer = utils.getTimer(session.timers, request.payload.project, request.payload.task);

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
			Clients.broadcast('timers/changed', { timers: session.timers });
		});
	});

	// sets the jobTypeId of a timer
	Clients.on('timer/set/jobType', function (request, respond, session) {
		var timer = utils.getTimer(session.timers, request.payload.project, request.payload.task);
		timer.jobTypeId = request.payload.value;
		Session.save(request.hostname, session, function () {
			Clients.broadcast('timers/changed', { timers: session.timers });
		});
	});

	// sets the billable state of a timer
	Clients.on('timer/set/billable', function (request, respond, session) {
		var timer = utils.getTimer(session.timers, request.payload.project, request.payload.task);
		timer.billable = request.payload.value;
		Session.save(request.hostname, session, function () {
			Clients.broadcast('timers/changed', { timers: session.timers });
		});
	});

	// sets the time of a timer
	Clients.on('timer/set/time', function (request, respond, session) {
		var timer = utils.getTimer(session.timers, request.payload.project, request.payload.task);
		respond({ valid: utils.setTimerTimeFromString(timer, request.payload.value) });
		Session.save(request.hostname, session, function () {
			Clients.broadcast('timers/changed', { timers: session.timers });
		});
	});

	// sets the summary of a timer
	Clients.on('timer/set/summary', function (request, respond, session) {
		var timer = utils.getTimer(session.timers, request.payload.project, request.payload.task);
		timer.summary = request.payload.value;
		Session.save(request.hostname, session, function () {
			Clients.broadcast('timers/changed', { timers: session.timers });
		});
	});

	// stops a timer
	Clients.on('timer/stop', function (request, respond, session) {
		var timer = utils.getTimer(session.timers, request.payload.project, request.payload.task);
		timer.state = 'stopped';
		timer.total = 0;
		timer.summary = '';
		Session.save(request.hostname, session, function () {
			Clients.broadcast('timers/changed', { timers: session.timers });
			respond({});
		});
	});

	// gets called once a timer has been successfully submitted
	Clients.on('timer/submitted', function (request, respond, session) {
		var timer = utils.getTimer(session.timers, request.payload.project, request.payload.task);
		timer.state = 'stopped';
		timer.total = 0;
		timer.summary = '';
		Session.save(request.hostname, session, function () {
			Clients.broadcast('timers/changed', { timers: session.timers });
			respond({});
		});
	});

	// gets called when the client needs the state of the timers
	Clients.on('timers/states', function (request, respond, session) {
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

	// returns an array of objects that contain submittable timer data,
	// this array is filtered by the requestees timers array, if the
	// requestee passes an empty timers array, all timers are returned
	Clients.on('timers/submittable', function (request, respond, session) {

		var timerPayloads = session.timers;

		// filter out all the timers that the client didn't pass us
		if (request.payload.timers.length > 0) {
			timerPayloads = timerPayloads.filter(function (timer) {
				return request.payload.timers.some(function (t) {
					if (timer.project == t.project && timer.task == t.task) return true;
				});
			});
		}

		// filter out stopped timers
		timerPayloads = timerPayloads.filter(function (timer) {
			return timer.state != 'stopped';
		});

		// get an array of submittable timers
		timerPayloads = timerPayloads.map(function (timer) {
			return {
				billable_status: timer.billable !== null ? timer.billable : session.prefs.billable,
				job_type_id: timer.jobTypeId !== null ? timer.jobTypeId : session.prefs.jobTypeId,
				record_date: utils.activeCollabDateString(new Date()),
				summary: timer.summary,
				task_id: timer.task,
				project_id: timer.project,
				value: utils.formattedTime(timer, session.prefs.roundingInterval, session.prefs.minimumEntry, true)
			};
		});

		respond({ timerPayloads: timerPayloads });
	});

	// resets the timers that the client passes us, or if no timers
	// are passed, we reset all the timers for the requestees hostname
	Clients.on('timers/stop', function (request, respond, session) {
		if (request.payload.timers.length > 0) {
			request.payload.timers.forEach(function (t) {
				var timer = utils.getTimer(session.timers, t.project, t.task);
				session.timers.splice(session.timers.indexOf(timer), 1);
			});
		}
		else {
			session.timers = [];
		}
		Session.save(request.hostname, session, function () {
			Clients.broadcast('timers/changed', { timers: session.timers });
			respond({});
		});
	});

	// tell the current tab to reset all that hostnames timers
	Clients.on('timers/reset/all', function (request, respond, session) {
		Clients.emit(null, 'timers/reset/all', {}, function (response) {
			respond(response);
		});
	});

	// tell the current tab to reset its relevant timers
	Clients.on('timers/reset/current', function (request, respond, session) {
		Clients.emit(null, 'timers/reset/current', {}, function (response) {
			respond(response);
		});
	});

	// tell the current tab to submit all that hostnames timers
	Clients.on('timers/submit/all', function (request, respond, session) {
		Clients.emit(null, 'timers/submit/all', {}, function (response) {
			respond(response);
		});
	});

	// tell the current tab to submit its relevant timers
	Clients.on('timers/submit/current', function (request, respond, session) {
		Clients.emit(null, 'timers/submit/current', {}, function (response) {
			respond(response);
		});
	});

});
