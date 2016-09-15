(function () {
var script = document.createElement('script');
script.appendChild(document.createTextNode('(' + (function () {
//------------------------------------- START INJECTION CODE -------------------------------------
	'use strict';

	var ACIT = {
		prefs: {
			get: function (key, defaultValue) {
				var val = defaultValue !== undefined ? defaultValue : null;
				Object.keys(window.localStorage).some(function (k) {
					if (k.indexOf('acit.pref.' + key) === 0) {
						try {
							val = JSON.parse(window.localStorage[k]);
						}
						catch (e) {
							val = window.localStorage[k];
						}
						return true;
					}
				});
				return val;
			},
			set: function (key, value) {
				window.localStorage['acit.pref.' + key] = value;
				return true;
			}
		},
		getJobTypes: function () {
			return window.angie.collections.job_types;
		},
		getFirstJobType: function () {
			var firstJobType = null;
			ACIT.getJobTypes().forEach(function (job_type) {
				if (firstJobType == null || job_type.id < firstJobType.id) firstJobType = job_type;
			});
			return firstJobType;
		}
	};

	window.ACIT = ACIT;

	var Timers = [], States = { 'stopped': 0, 'paused': 1, 'running': 2, 'submitting': 3 };

	var Styles = {
		base: {
			position: 'relative',
			top: -25,
			left: -178,
			marginRight: '-178px',
			width: 172,
			height: 19,
			lineHeight: '17px',
			clear: 'right',
			float: 'left',
			textAlign: 'center',
			cursor: 'default',
			boxSizing: 'border-box'
		},
		time: {
			width: 48,
			height: 19,
			lineHeight: '17px',
			clear: 'none',
			color: 'white',
			textAlign: 'center',
			cursor: 'pointer',
			float: 'right',
			borderRadius: '5px',
			boxSizing: 'border-box',
			border: '1px solid #aaa',
			userSelect: 'none'
		},
		button: {
			display: 'none',
			height: 19,
			lineHeight: '17px',
			color: 'black',
			float: 'right',
			textAlign: 'center',
			cursor: 'pointer',
			boxSizing: 'border-box',
			marginRight: 4,
			backgroundColor: 'white',
			border: '1px solid #aaa',
			borderRadius: '5px',
			padding: '0 4px 0 4px',
			userSelect: 'none'
		},
		menuButton: {
			display: 'block',
			float: 'right',
			width: '30px',
			backgroundRepeat: 'no-repeat',
			backgroundPosition: 'center center',
			marginLeft: '4px',
			position: 'relative',
			top: 2,
			border: '1px solid #666',
			height: '16px',
			backgroundColor: '#fff'
		},
		menuInput: {
			marginTop: 10,
			width: '100%',
			height: 32,
			borderRadius: 3,
			border: '1px solid #d1d1d1',
			boxShadow: '0 1px 1px rgba(0, 0, 0, 0.05)',
			padding: 8,
			fontSize: '12px',
			fontFamily: '"Clear Sans", "Helvetica Neue", Arial, sans-serif'
		},
		notificationManager: {
			position: 'fixed',
			top: 0,
			right: 0
		},
		notification: {
			position: 'relative',
			width: '250px',
			height: '100px',
			border: '1px solid #aaa',
			borderRadius: '5px'
		}
	};

	function Timer (parentEl) {

		Timers.push(this);

		var self = this;

		self.state = States.stopped;
		self.start = 0;
		self.total = 0;
		self.focused = false;
		self.jobType = null;
		self.projectId = null;
		self.taskId = null;
		self.dblclick = { clicks: 0, timeout: null };
		self.el = {};

		self.el.base = $('<div>');
		self.el.menuButton = $('<button>');
		self.el.time = $('<div>');

		parentEl.append(self.el.base.html([self.el.time, self.el.menuButton]));

		self.el.base
			.css(Styles.base)
			.mouseout(function (e) {
				if (!self.el.menu) {
					self.focused = false;
					self.updateButtonVisibility();
				}
			})
			.mouseover(function (e) {
				self.focused = true;
				self.updateButtonVisibility();
			});

		self.el.menuButton
			.css(Styles.menuButton)
			.addClass('icon')
			.addClass('icon_options_dropdown_black')
			.click(function (e) {
				if (e.target != self.el.menuButton[0]) return;
				e.stopPropagation();
				self.showMenu();
			});

		self.el.time
			.css(Styles.time).html('00:00')
			.click(function (e) {

				self.dblclick.clicks++;

				// single click logic
				if (self.dblclick.clicks === 1) {
					self.dblclick.timeout = window.setTimeout(function () {
						if (self.state == States.stopped || self.state == States.paused) {
							self.run();
						}
						else {
							self.pause();
						}
						self.dblclick.clicks = 0;
						self.dblclick.timeout = null;
					}, 250);
				}
				// double click logic
				else {
					if (self.dblclick.timeout) {
						clearTimeout(self.dblclick.timeout);
						self.dblclick.clicks = 0;
						self.dblclick.timeout = null;
						self.showMenu();
					}
				}

				e.stopPropagation();
			})
			.dblclick(function (e) {
				e.stopPropagation();
				e.preventDefault();
			});
	}

	Timer.prototype = {
		getJobTypeId: function () {
			var jobTypeId = ACIT.prefs.get('defaultJobType', ACIT.getFirstJobType().id);
			if (this.jobType !== null && this.jobType !== undefined) {
				jobTypeId = this.jobType;
			}
			return jobTypeId;
		},
		runningFor: function () {
			return (this.state == States.running ? Date.now() - this.start : 0);
		},
		save: function () {
			window.localStorage['acit.timer.' + this.projectId + '.' + this.taskId] = JSON.stringify({
				projectId: this.projectId,
				taskId: this.taskId,
				state: this.state,
				start: this.start,
				total: this.total,
				jobType: this.jobType
			});
		},
		load: function (projectId, taskId) {
			var timer = window.localStorage['acit.timer.' + projectId + '.' + taskId];
			if (timer) {
				try {
					timer = JSON.parse(timer);
					this.projectId = timer.projectId;
					this.taskId = timer.taskId;
					this.start = timer.start;
					this.total = timer.total;
					this.state = timer.state;
					this.jobType = timer.jobType;
					if (this.state == States.running) this.run();
					return true;
				}
				catch (e) {
					return false;
				}
			}
			return false;
		},
		removeDOM: function () {
			this.el.base.remove();
		},
		visibleInDOM: function () {
			var visible = $.contains(document.body, this.el.base[0]);
			return visible;
		},
		totalTime: function (round) {
			var total = this.total + (this.state == States.running ? (Date.now() - this.start) : 0);
			if (round) total = Math.ceil(total / round) * round;
			return total;
		},
		setTimeString: function (time) {

			var split = time.split(':');

			if (split.length != 2) return false;

			var hours = parseInt(split[0]);
			var mins = parseInt(split[1]);

			if (isNaN(hours) || isNaN(mins)) return false;
			if (hours > 24) return false;
			if (mins > 59) return false;

			var d = new Date(0);
			d.setUTCHours(hours);
			d.setUTCMinutes(mins);

			if (this.state == States.stopped) {
				this.total = d.getTime();
				this.start = Date.now();
				this.state = States.paused;
			}
			else if (this.state == States.paused) {
				this.total = d.getTime();
			}
			else if (this.state == States.running) {
				this.total = d.getTime();
				this.start = Date.now();
			}

			this.renderTime();
			this.save();

			return true;
		},
		getTimeString: function (colons, round) {

			var time = this.totalTime(round), text = '';

			// setting colons in the call will override the default
			if ((colons === undefined || colons === null) && this.state == States.running) {
				colons = !(this.el.time.html().indexOf(':') != -1);
			}

			var d = new Date(time);

			var h = d.getUTCHours().toString();
			var m = d.getUTCMinutes().toString();

			h = (h.length == 1 ? '0' + h : h);
			m = (m.length == 1 ? '0' + m : m);

			return h + (colons ? ':' : ' ') + m;
		},
		updateButtonVisibility: function () {
			if (this.focused) {
				this.el.menuButton.show();
			}
			else {
				this.el.menuButton.hide();
			}
		},
		renderTime: function () {
			var colons = true;
			if (this.state == States.running) {
				this.el.time.css({ backgroundColor: '#ff3c3c' });
				colons = !(this.el.time.html().indexOf(':') != -1);
			}
			else if (this.state == States.paused) this.el.time.css({ backgroundColor: '#ffc637' });
			else if (this.state == States.stopped) this.el.time.css({ backgroundColor: '#44a6ff' });
			this.el.time.html(this.getTimeString(colons));
		},
		run: function () {

			var self = this;

			if (this.state != States.running) {

				// pause all the other timers
				Timers.forEach(function (timer) {
					if (self != timer && timer.state == States.running) {
						timer.pause();
					}
				});

				this.start = Date.now();
				this.state = States.running;
			}

			this.updateButtonVisibility();
			this.renderTime();
		},
		pause: function () {

			if (this.state != States.paused) {
				this.total += this.runningFor();
				this.state = States.paused;
			}

			this.updateButtonVisibility();
			this.renderTime();
		},
		stop: function () {

			if (this.state != States.stopped) {
				this.start = this.total = 0;
				this.state = States.stopped;
			}

			this.updateButtonVisibility();
			this.renderTime();
		},
		submit: function (cb) {

			// get the date in the required format
			var da = new Date();
			var y = da.getFullYear(), m = da.getMonth() + 1, d = da.getDate();
			m = (m.toString().length == 1) ? '0' + m : m;
			d = (d.toString().length == 1) ? '0' + d : d;

			var value = this.getTimeString(true);

			// make the request
			fetch('http://projects.drminc.com/api/v1/projects/' + this.projectId + '/time-records', {
				method: 'POST',
				credentials: 'include',
				headers: {
					'X-Angie-CsrfValidator': window.getCsrfCookie(),
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					billable_status: 1,
					job_type_id: this.getJobTypeId(),
					record_date: y + "-" + m + "-" + d,
					summary: "",
					task_id: this.taskId,
					user_id: angie.user_session_data.logged_user_id,
					value: value
				})
			})
			.then(function (response) { return response.json(); })
			.then(function (json) { cb(null, json); })
			.catch(function (ex) { cb(ex, null); });
		},
		showMenu: function () {

			var self = this;

			var jobTypeId = self.getJobTypeId();

			// generate a list of <options> for the job type <select>
			var jobTypesEls = [];
			ACIT.getJobTypes().forEach(function (job_type) {
				var selected = (jobTypeId == job_type.id ? 'selected' : null);
				jobTypesEls.push($('<option>').val(job_type.id).html(job_type.name).attr('selected', selected));
			});

			var jobTypeSelect = $('<select>');

			self.el.menu = $('<div>');
			self.el.menuButton.html([self.el.menu]);
			self.el.menu
				.addClass('popover task_popover')
				.css({ visibility: 'visible', display: 'block', left: -115, top: 15, textAlign: 'left' })
				.html([
					$('<div>').addClass('popover_arrow').css({ left: '50%' }),
					$('<div>').addClass('popover_inner').html(
						$('<div>').addClass('popover_content').html(
							$('<div>').addClass('task_panel_popover').attr('tabindex', 0).html([
								$('<div>').addClass('task_panel_property').html([
									$('<label>').html('Job Type'),
									jobTypeSelect
										.css({ marginTop: 10, width: '100%', backgroundColor: 'white' })
										.html(jobTypesEls)
										.change(function () {
											self.jobType = parseInt(this.value);
											self.save();
										})
								]),
								$('<div>').addClass('task_panel_property').html([
									$('<label>').html('Time'),
									$('<input>').css(Styles.menuInput).val(self.getTimeString(true)).keyup(function (e) {
										this.style.outlineColor = (self.setTimeString(this.value) ? null : 'red');
										if (e.keyCode == 13) self.removeMenu();
									})
								]),
								$('<div>').addClass('task_panel_actions').html([
									$('<a>').attr('href', "#").html('Submit').click(function () {
										self.submit(function (err, response) {
											// leave the timer in it's old state if the request failed
											if (err) {
												console.log(err);
											}
											// reset the timer if we we're successful
											else {
												console.log(response);
												self.stop();
												self.save();
											}
										});
									}),
									$('<a>').attr('href', "#").html('Reset').click(function () {
										self.stop();
										self.removeMenu();
									})
								]),
							])
						)
					)
				]);

			jobTypeSelect.get(0).focus();
		},
		removeMenu: function () {
			this.el.menu.remove();
			this.el.menu = null;
			this.focused = false;
			this.updateButtonVisibility();
		}
	};

	var Notification = {
		manager: null,
		notifications: [],
		setup: function () {
			Notification.manager = $('<div>').css(notificationManager);
			$(document.body).prepend(Notification.manager);
			window.setInterval(function () {

			}, 1000);
		},
		create: function (message) {
			var el = $('<div>').css(Styles.notification).html(message);
			Notification.notifications.push({ start: Date.now(), el: el });
			Notification.manager.append(el);
		}
	};

	var render = function () {

		// save the current timers out and remove them from the DOM
		Timers.forEach(function (timer) {
			timer.save();
			timer.removeDOM();
		});

		Timers = [];
		window.Timers = Timers;

		var onMyWork = window.location.pathname.indexOf('/my-work') !== -1;

		$('div.task').each(function (e) {

			if (!onMyWork) $(this).css('paddingLeft', '120px');

			var split = $(this).find('.task_name').attr('href').split('/');
			var timer = new Timer($(this).find('.task_view_mode').parent());
			var projectId = parseInt(split[1]);
			var taskId = parseInt(split[3].split('?')[0]);

			if (!timer.load(projectId, taskId)) {
				timer.projectId = projectId;
				timer.taskId = taskId;
				timer.state = States.stopped;
			}

			timer.updateButtonVisibility();
			timer.renderTime();
		});
	};

	// this will wait until we're mostly sure that the task have all been added to the page
	var inject = function () {
		var taskInsertTracking = { total: 0, last: null };
		var injectInterval = window.setInterval(function () {
			var total = $('div.task').length;
			// are task on the page?
			if (total > 0) {
				// has the total samed the same between checks?
				if (taskInsertTracking.total == total) {
					window.clearInterval(injectInterval);
					window.setTimeout(render, 100);
				}
				else {
					taskInsertTracking.total = total;
				}
			}
		}, 100);
	};

	// remove the timer menu if we click outside of it
	$(document.body).click(function (e) {
		Timers.forEach(function (timer) {
			if (timer.el.menu) {
				if (!$.contains(timer.el.menu[0], e.target)) {
					timer.removeMenu();
				}
			}
		});
	});

	// render the timers once a second
	window.setInterval(function () {

		var renderAgain = (Timers.length === 0);

		Timers.forEach(function (timer) {
			timer.save();
			timer.renderTime();
			if (!renderAgain && !timer.visibleInDOM()) renderAgain = true;
		});

		// we render everything again if something has disappeared from the DOM
		if (renderAgain) render();
	}, 1000);

	// setup message passing with the content scripts isolated environment
	window.addEventListener("message", function (event) {
		if (event.source != window || !event.data.type || event.data.type != "FROM_EXT") return;
		var responseData = { id: event.data.id, type: "FROM_PAGE", payload: { action: event.data.payload.action } };
		switch (event.data.payload.action) {
			case 'get': {
				responseData.payload.value = ACIT.prefs.get(event.data.payload.key)
			} break;
			case 'set': {
				ACIT.prefs.set(event.data.payload.key, event.data.payload.value)
			} break;
			case 'getJobTypes': {
				responseData.payload.jobTypes = ACIT.getJobTypes();
			} break;
		}
		window.postMessage(responseData, '*');
	}, false);

	inject();
//-------------------------------------- END INJECTION CODE --------------------------------------
}) + ')();'));
(document.body || document.head || document.documentElement).appendChild(script);
})();

// setup message passing with the browser window
var pmcbs = []; window.addEventListener("message", function (event) {
	if (event.source != window || !event.data.type || event.data.type != "FROM_PAGE") return;
	pmcbs.forEach(function (cb, i, cbs) {
		if (cb.id == event.data.id) {
			cb.cb(event.data.payload);
			cbs.splice(i, 1);
		}
	});
}, false);

// listen for messages from the popup
chrome.runtime.onMessage.addListener(function (msg, sender, respond) {
	var id = "", chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (var i = 0; i < 32; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
	window.postMessage({ id: id, type: "FROM_EXT", payload: msg }, "*");
	pmcbs.push({ id: id, cb: function (payload) {
		respond(payload);
	}});
	return true;
});

window.injected = true;
