(function () {
	/*
	* TJ 04.10.2019
	* fix for v6 (add class to body)
	*/
	if(typeof undefined !== typeof window.angie){
		if((parseFloat(window.angie.application_version) * 1) >= 6) {
			$('body').addClass('v6-or-higher');
		}
	}

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
						if (++i == urls.length) cb.apply(this, modules); else next();
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

	var Server = {
		_handlers: [],
		_genId: function (len) {
			var id = "", c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
			for (var i = 0; i < len; i++) id += c.charAt(Math.floor(Math.random() * c.length));
			return id;
		},
		on: function (action, cb) {
			this._handlers.push({ id: this._genId(32), action: action, cb: cb });
		},
		do: function (action, payload, cb) {
			var handler = { id: this._genId(32), action: action, cb: cb ? cb : null };
			this._handlers.push(handler);
			window.postMessage({
				from: 'CLIENT_INTERNAL',
				id: handler.id,
				action: handler.action,
				hostname: window.location.hostname,
				payload: payload
			}, "*");
		},
		dispatchId: function (id, payload) {
			this._handlers.forEach(function (handler, i, handlers) {
				if (handler.id == id) {
					if (typeof handler.cb === 'function') handler.cb(payload);
					handlers.splice(i, 1);
				}
			});
		},
		dispatchAction: function (action, payload) {
			this._handlers.forEach(function (handler, i, handlers) {
				if (handler.action == action) {
					if (typeof handler.cb === 'function') handler.cb(payload);
				}
			});
		},
		setup: function () {
			var self = this;
			window.addEventListener("message", function (event) {
				if (event.source != window || !event.data.from || event.data.from != 'CLIENT_EXTERNAL') return;
				if (event.data.id) {
					self.dispatchId(event.data.id, event.data.payload);
				}
				else {
					self.dispatchAction(event.data.action, event.data.payload);
				}
			}, false);
		}
	};

	Server.setup();

	function main (utils) {

		var NotificationManager = {
			_notifications: [],
			_el: null,
			setup: function () {
				this._el = $('<div>').addClass('acit-notifications');
				$(document.body).append(this._el);
			},
			create: function (content, options) {

				if (!options) options = {};
				if (!Number.isInteger(options.lifespan)) options.lifespan = null;
				if (options.dismissable === undefined) options.dismissable = false;

				var self = this;
				var notification = $('<div>')
					.addClass('acit-notifications-notification')
					.html([$('<span>').html(content)])
					.fadeIn(500);

				self._el.append(notification);
				self._notifications.push(notification);

				if (Number.isInteger(options.lifespan)) {
					window.setTimeout(function () { self.clear(notification); }, options.lifespan);
				}

				if (options.dismissable) {
					notification.append(
						$('<div>').addClass('acit-notifications-notification-x noselect').html('x').click(function (e) {
							self.clear(notification, 250);
						})
					);
				}

				return notification;
			},
			update: function (notification, content) {
				notification.find('span').html(content);
			},
			clear: function (notification, options) {

				if (!options) options = {};
				if (!Number.isInteger(options.fadeSpeed)) options.fadeSpeed = 750;
				if (!Number.isInteger(options.delay)) options.delay = 0;

				var self = this;

				window.setTimeout(function () {
					notification.fadeOut(options.fadeSpeed, function () {
						notification.css({ visibility: 'hidden', display: 'block' });
						notification.slideUp(250, function () {
							notification.remove();
							self._notifications.splice(self._notifications.indexOf(notification), 1);
						});
					});
				}, options.delay);
			}
		};

		NotificationManager.setup();

		var TimerManager = {
			timers: [],
			menuElement: null,
			menuPropCache: null,
			timerForMenu: null,
			mutationObserver: null,
			removeMenu: function (e) {
				if (TimerManager.timerForMenu) {
					TimerManager.timerForMenu.el.menu.css('display', '');
					TimerManager.menuElement.remove();
					TimerManager.menuElement = null;
					TimerManager.timerForMenu = null;
				}
			},
			refreshMenu: function (project, task) {
				var self = this;
				Server.do('menu/content', { project: project, task: task }, function (payload) {

					self.menuElement.find('.acit-timer-menu-dropdown-jobType select').html(
						window.angie.collections.job_types.map(function (jobType) {
							return $('<option>').val(jobType.id).html(jobType.name).attr('selected', (payload.jobTypeId == jobType.id ? 'selected' : null));
						})
					);

					self.menuElement.find('.acit-timer-menu-dropdown-summary textarea').val(payload.summary);

					self.menuElement.find('.acit-timer-menu-dropdown-billable select').html([
						$('<option>').val('1').html('Yes').attr('selected', (payload.billable ? 'selected' : null)),
						$('<option>').val('0').html('No').attr('selected', (!payload.billable ? 'selected' : null))
					]);

					self.menuElement.find('.acit-timer-menu-dropdown-timer input').val(payload.formattedTime);

					self.menuPropCache = payload;
				});
			},
			showMenu: function (project, task) {

				var self = this;

				// remove the old menu if it exists
				if (self.menuElement) {
					self.timerForMenu.el.menu.css('display', '');
					self.menuElement.remove();
					self.menuElement = null;
					self.timerForMenu = null;
				}

				// create the new menu, if the timer exists
				var timer = this.getTimer(project, task);

				if (timer) {

					self.timerForMenu = timer;
					self.timerForMenu.el.menu[0].style.setProperty('display', 'block', 'important');

					self.menuElement = $('<div>');
					timer.el.base.append([self.menuElement]);

					var jobTypeEl = $('<div>');
					var billableEl = $('<div>');
					var timeEl = $('<div>');
					var summaryEl = $('<div>');
					var actionSubmitEl = $('<a>');
					var actionResetEl = $('<a>');
					var actionsEl = $('<div>');

					jobTypeEl.addClass('acit-timer-menu-dropdown-jobType task_panel_property').html([
						$('<label>').html('Job Type'),
						$('<select>')
							.addClass('acit-timer-menu-dropdown-select')
							.html(self.menuPropCache ? window.angie.collections.job_types.map(function (jobType) {
								return $('<option>').val(jobType.id).html(jobType.name).attr('selected', (self.menuPropCache.jobTypeId == jobType.id ? 'selected' : null));
							}) : [])
							.change(function () {
								Server.do('timer/set/jobType', {
									project: project,
									task: task,
									value: parseInt(this.value)
								});
							})
					]);

					summaryEl.addClass('acit-timer-menu-dropdown-summary task_panel_property').html([
						$('<label>').html('Description'),
						$('<textarea>').addClass('acit-timer-menu-dropdown-input')
							.val(self.menuPropCache ? self.menuPropCache.summary : '')
							.keyup(function (e) {
								Server.do('timer/set/summary', { project: project, task: task, value: this.value });
								e.preventDefault();
							})
							.dblclick(function (e) { e.stopPropagation(); e.preventDefault(); })
					]);

					billableEl.addClass('acit-timer-menu-dropdown-billable task_panel_property').html([
						$('<label>').html('Billable'),
						$('<select>')
							.addClass('acit-timer-menu-dropdown-select')
							.html(self.menuPropCache ? [
								$('<option>').val('1').html('Yes').attr('selected', (self.menuPropCache.billable ? 'selected' : null)),
								$('<option>').val('0').html('No').attr('selected', (!self.menuPropCache.billable ? 'selected' : null))
							] : [])
							.change(function () {
								Server.do('timer/set/billable', {
									project: project,
									task: task,
									value: (this.value === '1')
								});
							})
					]);

					timeEl.addClass('acit-timer-menu-dropdown-timer task_panel_property').html([
						$('<label>').html('Time'),
						$('<input>').addClass('acit-timer-menu-dropdown-input')
						.val(self.menuPropCache ? self.menuPropCache.formattedTime : '')
						.keyup(function (e) {
							var self = this;
							Server.do('timer/set/time', {
								project: project,
								task: task,
								value: this.value
							}, function (payload) {
								self.style.outlineColor = (payload.valid ? null : 'red');
							});
							if (e.keyCode == 13) TimerManager.removeMenu();
							e.preventDefault();
						}).dblclick(function (e) { e.stopPropagation(); e.preventDefault(); })
					]);

					actionSubmitEl.attr('href', "#").html('Submit').click(function () {
						Server.do('timers/submittable', { timers: [{ project: project, task: task }] }, function (payload) {
							if (payload.timerPayloads.length < 1) {
								NotificationManager.create('Timer does not need submitted', { dismissable: true });
								return;
							}
							NotificationManager.create('Submitting timer', { lifespan: 1500 });
							TimerManager.submitTimers({
								timerPayloads: payload.timerPayloads,
								submitted: function (index) {},
								completed: function (err) {
									if (err) {
										NotificationManager.create('Error while submitting timers', { dismissable: true });
									}
									else {
										Server.do('timers/stop', { timers: [{ project: project, task: task }] }, function (payload) {
											NotificationManager.create('Timer successfully submitted!', { lifespan: 1500 });
										});
									}
								}
							});
						});

						TimerManager.removeMenu();
					});

					actionResetEl.attr('href', "#").html('Reset').click(function () {
						Server.do('timer/stop', { project: project, task: task });
						TimerManager.removeMenu();
					})

					actionsEl.addClass('task_panel_actions').html([ actionSubmitEl, actionResetEl ]);

					self.menuElement
						.addClass('acit-timer-menu-dropdown popover task_popover')
						.html([
							$('<div>').addClass('popover_arrow').css({ left: '50%' }),
							$('<div>').addClass('popover_inner').html(
								$('<div>').addClass('popover_content').html(
									$('<div>').addClass('task_panel_popover').attr('tabindex', 0).html([
										timeEl, summaryEl, jobTypeEl, billableEl, actionsEl
									])
								)
							)
						]);

					self.refreshMenu(project, task);
				}
			},
			checkTimerOnDOM: function (project, task) {
				return $.contains(document.body, this.getTimer(project, task).el.base[0]);
			},
			addTimerToDom: function (project, task, parentEl) {
				var self = this;
				var timer = self.getTimer(project, task);
				if (timer) {

					timer.el.base = $('<div>');
					timer.el.menu = $('<button>');
					timer.el.time = $('<div>');

					parentEl.append(timer.el.base.html([timer.el.time, timer.el.menu]));

					// the task needs to be at an offset on individual project pages
					if (window.location.pathname.match(/(\/projects\/)([0-9]*)/g)) {
						parentEl.css({ paddingLeft: '100px' });
						timer.el.base.css({ marginLeft: '-78px' });
					}
					else {
						timer.el.base.css({ marginLeft: '-180px' });
					}

					timer.el.base.addClass('acit-timer');

					timer.el.menu
						.addClass('acit-timer-menu icon icon_options_dropdown_black')
						.click(function (e) {
							if (e.target != timer.el.menu[0]) return;
							e.stopPropagation();
							self.showMenu(project, task);
						})
						.dblclick(function (e) {
							e.stopPropagation();
							e.preventDefault();
						});

					timer.el.time
						.addClass('acit-timer-time noselect')
						.html('00:00')
						.click(function (e) {
							Server.do('timer/clicked', { project: project, task: task });
						})
						.dblclick(function (e) {
							e.stopPropagation();
							e.preventDefault();
						});

					if (self.timerForMenu) {
						self.showMenu(self.timerForMenu.project, self.timerForMenu.task);
					}
				}
			},
			getTimer: function (project, task) {
				var result = null;
				this.timers.some(function (timer) {
					if (timer.project == project && timer.task == task) {
						result = timer;
						return true;
					}
				});
				return result;
			},
			addTimer: function (project, task, parentEl) {

				var self = this;

				var timer = { el: {} };

				self.timers.push(timer);

				timer.project = project;
				timer.task = task;

				self.addTimerToDom(project, task, parentEl);

				return timer;
			},
			updateTimersList: function () {
				var self = this;
				// search for all the possible timer locations
				var timersOnDOM = [];
				$('div.task').each(function (e) {
					var href = $(this).find('.task_name').attr('href');
					if (href) {
						var split = href.split('/');
						var project = parseInt(split[1]);
						var task = parseInt(split[3].split('?')[0]);
						var timer = self.getTimer(project, task);
						var parentEl = $(this).find('.task_view_mode').parent();
						// FIX 04.10.2019 - .task and .task_view_mode
						// are sometimes the same element (in some views)
						if(!$(this).find('.task_view_mode').length && $(this).hasClass('task_view_mode')){
							var parentEl = $(this).parent();
						}
						if (!timer) {
							self.addTimer(project, task, parentEl);
						}
						else if (!self.checkTimerOnDOM(project, task)) {
							self.addTimerToDom(project, task, parentEl);
						}
						timersOnDOM.push({ project: project, task: task });
					}
				});
				// remove any timers that were not on the DOM anymore
				self.timers.forEach(function (timer, i, timers) {
					if (!timersOnDOM.some(function (t) {
						if (timer.project == t.project && timer.task == t.task) {
							return true;
						}
					})) {
						timer.el.base.remove();
						timers.splice(i, 1);
					}
				});

				self.renderTimers();
			},
			updateTimersProps: function (timers) {
				var self = this;
				// restart from a blank slate
				self.timers.forEach(function (timer) {
					// we need to do this because we don't actually store stopped timers
					// so any timers client side that didn't get passed down, won't update in the UI here
					timer.state = 'stopped';
					timer.total = 0;
					timer.start = 0;
				});
				// now apply the property updates from the server
				timers.forEach(function (t) {
					var timer = self.getTimer(t.project, t.task);
					if (timer) {
						timer.state = t.state;
						timer.total = t.total;
						timer.start = t.start;
					}
				});
				self.renderTimers();
			},
			renderTimers: function () {
				this.timers.forEach(function (timer) {
					var html = utils.formattedTime(timer, 0, 0);
					if (timer.state == 'running') {
						timer.el.time.css({ backgroundColor: '#48f311' });
						if (timer.el.time.html().indexOf(':') !== -1) {
							html = html.replace(':', ' ');
						}
					}
					else if (timer.state == 'paused') {
						timer.el.time.css({ backgroundColor: '#ffc637' });
					}
					else {
						html = "00:00";
						timer.el.time.css({ backgroundColor: '#ff3c3c' });
					}
					timer.el.time.html(html);
				});
			},
			submitTimer: function (timerPayload, cb) {
				var project = timerPayload.project_id;
				delete timerPayload.project_id;
				timerPayload.user_id = angie.user_session_data.logged_user_id;
				fetch(angie.api_url + '/projects/' + project + '/time-records', {
					method: 'POST',
					credentials: 'include',
					headers: {
						'X-Angie-CsrfValidator': window.getCsrfCookie(),
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(timerPayload)
				})
				.then(function (response) { return response.json(); })
				.then(function (json) { cb(null); })
				.catch(function (ex) { cb(ex); });
			},
			submitTimers: function (options) {
				var self = this;
				utils.waterfall(options.timerPayloads.map(function (timerPayload, i) {
					return function (next) {
						self.submitTimer(timerPayload, function (err) {
							if (err) {
								next(err);
							}
							else {
								options.submitted(i);
								next(null);
							}
						});
					};
				}), function (err) {
					options.completed(err);
				});
			},
			requestUpdate: function () {
				var self = this;
				self.updateTimersList();
				Server.do('timers/states', {}, function (payload) {
					self.updateTimersProps(payload.timers);
				});
			},
			setupMutationObserver: function () {
				var self = this;
				self.mutationObserver = new MutationObserver(function (mutations) {
					$('.task.ui-sortable-helper').css('z-index', 9999999);
					mutations.some(function (mutation) {
						if (mutation.type == 'characterData' || mutation.type == 'attributes' || !mutation.target.className) return;
						var className = mutation.target.className;
						if (className.indexOf('acit-timer') !== -1) return;
						if (className.indexOf('timer')) {
							self.requestUpdate();
							return true;
						}
					});
				});
				self.mutationObserver.observe(document.body, { childList: true, attributes: true, characterData: true, subtree: true });
			}
		};

		Server.on('timers/changed', function (payload) {
			TimerManager.updateTimersProps(payload.timers);
		});

		Server.on('timers/reset/all', function (payload) {
			Server.do('timers/stop', { timers: [] });
		});

		Server.on('timers/reset/current', function (payload) {
			Server.do('timers/stop', { timers: utils.getSendableTimers(TimerManager.timers) });
		});

		Server.on('timers/submit/all', function (payload) {
			Server.do('timers/submittable', { timers: [] }, function (payload) {
				if (payload.timerPayloads.length < 1) {
					NotificationManager.create('No timers to submit', { dismissable: true });
					return;
				}
				NotificationManager.create('Submitting all ' + payload.timerPayloads.length + ' timers', { lifespan: 1500 });
				TimerManager.submitTimers({
					timerPayloads: payload.timerPayloads,
					submitted: function (index) {
						NotificationManager.create('Submitted ' + (index + 1) + ' of ' + payload.timerPayloads.length + ' timers', { lifespan: 1000 });
					},
					completed: function (err) {
						if (err) {
							NotificationManager.create('Error while submitting timers', { dismissable: true });
						}
						else {
							Server.do('timers/stop', { timers: [] }, function (payload) {
								NotificationManager.create('Timers successfully submitted!', { lifespan: 1500 });
							});
						}
					}
				});
			});
		});

		Server.on('timers/submit/current', function (payload) {
			var timers = utils.getSendableTimers(TimerManager.timers);
			Server.do('timers/submittable', { timers: timers }, function (payload) {
				if (payload.timerPayloads.length < 1) {
					NotificationManager.create('No timers to submit', { dismissable: true });
					return;
				}
				NotificationManager.create('Submitting the ' + payload.timerPayloads.length + ' timers on this page', { lifespan: 1500 });
				TimerManager.submitTimers({
					timerPayloads: payload.timerPayloads,
					submitted: function (index) {
						NotificationManager.create('Submitted ' + (index + 1) + ' of ' + payload.timerPayloads.length + ' timers', { lifespan: 1000 });
					},
					completed: function (err) {
						if (err) {
							NotificationManager.clear(notification);
							NotificationManager.create('Error while submitting timers', { dismissable: true });
						}
						else {
							Server.do('timers/stop', { timers: timers }, function (payload) {
								NotificationManager.create('Timers successfully submitted!', { lifespan: 1500 });
							});
						}
					}
				});
			});
		});

		$(document.body).click(function (e) {
			if (TimerManager.timerForMenu && !$.contains(TimerManager.timerForMenu.el.base.find('.acit-timer-menu-dropdown')[0], e.target)) {
				TimerManager.removeMenu();
			}
		});

		window.setInterval(function () { TimerManager.renderTimers(); }, 1000);

		// ensure we send the job types only once they've been set
		var trySendingJobTypesInterval = window.setInterval(function () {
			if (window.angie && window.angie.collections && window.angie.collections.job_types) {

				// tell the extension what the job types for this ActiveCollab server are
				Server.do('session/jobTypes/set', { jobTypes: window.angie.collections.job_types }, function () {
					// once we've updated the server, begin doing stuff
					TimerManager.setupMutationObserver();
					TimerManager.requestUpdate();
				});

				window.clearInterval(trySendingJobTypesInterval);
			}
		}, 500);

		// for development purposes
		window.NotificationManager = NotificationManager;
		window.TimerManager = TimerManager;
	}

	// get the root url of our extension, require our modules
	Server.do('extension/get/url', {}, function (payload) {
		require(payload.url + 'utils.js', main);
	});
})();
