// this file is injected by 'check/external.js' after 'check/internal.js' tells it that we're dealing with an ActiveCollab Page
(function () {

var script = document.createElement('script');
script.appendChild(document.createTextNode('(' + (function () {
/* **************************************** START INJECTION CODE **************************************** */
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

	function Timer (parentEl) {

		Timers.push(this);

		var self = this;

		self.state = States.stopped;
		self.start = 0;
		self.total = 0;
		self.jobType = null;
		self.billable = null;
		self.summary = '';
		self.projectId = null;
		self.taskId = null;
		self.dblclick = { clicks: 0, timeout: null };
		self.el = {};

		self.el.base = $('<div>');
		self.el.menu = $('<button>');
		self.el.time = $('<div>');

		parentEl.append(self.el.base.html([self.el.time, self.el.menu]));

		self.el.base.addClass('acit-timer');

		self.el.menu
			.addClass('acit-timer-menu icon icon_options_dropdown_black')
			.click(function (e) {
				if (e.target != self.el.menu[0]) return;
				e.stopPropagation();
				removeMenus(e);
				self.showMenu();
			});

		self.el.time
			.addClass('acit-timer-time')
			.html('00:00')
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
						removeMenus(e);
						self.showMenu();
					}
				}

				e.stopPropagation();
			})
			.dblclick(function (e) { e.stopPropagation(); e.preventDefault(); });
	}

	Timer.prototype = {
		getJobTypeId: function () {
			var jobTypeId = ACIT.prefs.get('defaultJobType', ACIT.getFirstJobType().id);
			if (this.jobType !== null && this.jobType !== undefined) {
				jobTypeId = this.jobType;
			}
			return jobTypeId;
		},
		getBillable: function () {
			var billable = ACIT.prefs.get('defaultIsBillable', true);
			if (this.billable !== null && this.billable !== undefined) {
				billable = this.billable;
			}
			return billable;
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
				jobType: this.jobType,
				billable: this.billable,
				summary: this.summary
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
					this.billable = timer.billable;
					this.summary = timer.summary;
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
		totalTime: function (roundBy, minimumValue, removeSeconds) {
			var total = this.total + (this.state == States.running ? (Date.now() - this.start) : 0);
			if (removeSeconds === true) {
				total -= total % 10000;
			}
			if (Number.isInteger(roundBy) && roundBy !== 0) {
				total = Math.ceil(total / roundBy) * roundBy;
			}
			if (Number.isInteger(minimumValue) && total < minimumValue) {
				total = minimumValue;
			}
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
		getTimeString: function (colons, roundBy, minimumValue, removeSeconds) {

			var time = this.totalTime(roundBy, minimumValue, removeSeconds), text = '';

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

			this.renderTime();
		},
		pause: function () {

			if (this.state != States.paused) {
				this.total += this.runningFor();
				this.state = States.paused;
			}

			this.renderTime();
		},
		stop: function () {

			if (this.state != States.stopped) {
				this.start = this.total = 0;
				this.summary = "";
				this.state = States.stopped;
			}

			this.renderTime();
		},
		submit: function (cb) {

			// get the date in the required format
			var da = new Date();
			var y = da.getFullYear(), m = da.getMonth() + 1, d = da.getDate();
			m = (m.toString().length == 1) ? '0' + m : m;
			d = (d.toString().length == 1) ? '0' + d : d;

			var value = this.getTimeString(true, ACIT.prefs.get('roundingInterval'), ACIT.prefs.get('minimumEntry'), true);

			// make the request
			fetch('http://projects.drminc.com/api/v1/projects/' + this.projectId + '/time-records', {
				method: 'POST',
				credentials: 'include',
				headers: {
					'X-Angie-CsrfValidator': window.getCsrfCookie(),
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					billable_status: this.getBillable(),
					job_type_id: this.getJobTypeId(),
					record_date: y + "-" + m + "-" + d,
					summary: this.summary,
					task_id: this.taskId,
					user_id: angie.user_session_data.logged_user_id,
					value: value
				})
			})
			.then(function (response) { return response.json(); })
			.then(function (json) { cb(null, json); })
			.catch(function (ex) { cb(ex, null); });
		},
		showMenu: function (focusSubmit) {

			var self = this;

			var jobTypeId = self.getJobTypeId();
			var billable = self.getBillable();

			// generate a list of <options> for the job type <select>
			var jobTypesEls = [];
			ACIT.getJobTypes().forEach(function (job_type) {
				var selected = (jobTypeId == job_type.id ? 'selected' : null);
				jobTypesEls.push($('<option>').val(job_type.id).html(job_type.name).attr('selected', selected));
			});

			var submitButton = $('<a>');

			self.el.menu[0].style.setProperty('display', 'block', 'important');

			self.el.menuDropdown = $('<div>');
			self.el.base.append([self.el.menuDropdown]);
			self.el.menuDropdown
				.addClass('acit-timer-menu-dropdown popover task_popover')
				.html([
					$('<div>').addClass('popover_arrow').css({ left: '50%' }),
					$('<div>').addClass('popover_inner').html(
						$('<div>').addClass('popover_content').html(
							$('<div>').addClass('task_panel_popover').attr('tabindex', 0).html([
								$('<div>').addClass('task_panel_property').html([
									$('<label>').html('Job Type'),
									$('<select>')
										.addClass('acit-timer-menu-dropdown-select')
										.html(jobTypesEls)
										.change(function () {
											self.jobType = parseInt(this.value);
											self.save();
										})
								]),
								$('<div>').addClass('task_panel_property').html([
									$('<label>').html('Billable'),
									$('<select>')
										.addClass('acit-timer-menu-dropdown-select')
										.html([
											$('<option>').val('1').html('Yes').attr('selected', (billable ? 'selected' : null)),
											$('<option>').val('0').html('No').attr('selected', (!billable ? 'selected' : null))
										])
										.change(function () {
											self.billable = (this.value === '1');
											self.save();
										})
								]),
								$('<div>').addClass('task_panel_property').html([
									$('<label>').html('Time'),
									$('<input>').addClass('acit-timer-menu-dropdown-input').val(self.getTimeString(true)).keyup(function (e) {
										this.style.outlineColor = (self.setTimeString(this.value) ? null : 'red');
										if (e.keyCode == 13) self.removeMenu();
										e.preventDefault();
									}).dblclick(function (e) { e.stopPropagation(); e.preventDefault(); })
								]),
								$('<div>').addClass('task_panel_property').html([
									$('<label>').html('Description'),
									$('<textarea>').addClass('acit-timer-menu-dropdown-input').val(self.summary).keyup(function (e) {
										self.summary = this.value;
										e.preventDefault();
									}).dblclick(function (e) { e.stopPropagation(); e.preventDefault(); })
								]),
								$('<div>').addClass('task_panel_actions').html([
									submitButton.attr('href', "#").html('Submit').click(function () {
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
												self.removeMenu();
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

			if (focusSubmit) submitButton.get(0).focus();
		},
		removeMenu: function () {
			this.el.menu.css('display', '');
			this.el.menuDropdown.remove();
			this.el.menuDropdown = null;
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
			var el = $('<div>').css('acit-notification').html(message);
			Notification.notifications.push({ start: Date.now(), el: el });
			Notification.manager.append(el);
		}
	};

	function render () {

		// save the current timers out and remove them from the DOM
		Timers.forEach(function (timer) {
			timer.save();
			timer.removeDOM();
		});

		Timers = [];
		window.Timers = Timers;

		var onMyWork = window.location.pathname.indexOf('/my-work') !== -1;

		var renderedSomething = false;
		$('div.task').each(function (e) {

			if (!onMyWork) $(this).css('paddingLeft', '100px');

			var split = $(this).find('.task_name').attr('href').split('/');
			var timer = new Timer($(this).find('.task_view_mode').parent());
			var projectId = parseInt(split[1]);
			var taskId = parseInt(split[3].split('?')[0]);

			if (!timer.load(projectId, taskId)) {
				timer.projectId = projectId;
				timer.taskId = taskId;
				timer.state = States.stopped;
			}

			timer.renderTime();

			renderedSomething = true;
		});

		console.log('called render, renderedSomething = ' + renderedSomething);
	};

	// this will wait until we're mostly sure that the task have all been added to the page
	function inject () {
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

	function removeMenus (e) {
		Timers.forEach(function (timer) {
			if (timer.el.menuDropdown) {
				if (!$.contains(timer.el.menuDropdown[0], e.target)) {
					timer.removeMenu();
				}
			}
		});
	}

	// remove the timer menu if we click outside of it
	$(document.body).click(removeMenus);

	// check if the timers need re rendered
	var lastWindowHref = window.location.href;
	function checkForDirtyDOM () {
		//console.log('here');
		if (Timers.some(function (timer) {
			if (!timer.visibleInDOM()) return true;	
		}) || lastWindowHref != window.location.href) render();
		lastWindowHref = window.location.href;
		window.requestAnimationFrame(checkForDirtyDOM);
	}

	// render the timers once a second
	window.setInterval(function () {
		Timers.forEach(function (timer) {
			timer.save();
			timer.renderTime();
		});
	}, 1000);

	// setup message passing with the content scripts isolated environment
	window.addEventListener("message", function (event) {
		if (event.source != window || !event.data.from || event.data.from != "TIMER_EXTERNAL") return;
		var responseData = { id: event.data.id, from: "TIMER_INTERNAL", payload: { action: event.data.payload.action } };
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
	checkForDirtyDOM();
/* **************************************** END INJECTION CODE **************************************** */
}) + ')();'));
(document.body || document.head || document.documentElement).appendChild(script);
})();

/* ****************************************.BEGIN CONTENT SCRIPT CODE.**************************************** */

// setup message passing with the browser window
var pmcbs = []; window.addEventListener("message", function (event) {
	if (event.source != window || !event.data.from || event.data.from != "TIMER_INTERNAL") return;
	pmcbs.forEach(function (cb, i, cbs) {
		if (cb.id == event.data.id) {
			cb.cb(event.data.payload);
			cbs.splice(i, 1);
		}
	});
}, false);

// listen for messages from the popup
chrome.runtime.onMessage.addListener(function (msg, sender, respond) {
	if (msg.from != "POPUP") return;
	var id = "", chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (var i = 0; i < 32; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
	pmcbs.push({ id: id, cb: function (payload) { respond(payload); } });
	window.postMessage({ id: id, from: "TIMER_EXTERNAL", payload: msg.payload }, "*");
	return true;
});

window.injected = true;

/* ****************************************.END.CONTENT.SCRIPT.CODE.**************************************** */
