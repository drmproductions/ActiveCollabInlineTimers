(function () {

	console.log('page.js loaded!');

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

	// get the root url of our extension
	Server.do('getExtensionUrl', {}, function (payload) {

		// require our modules
		require(payload.url + 'utils.js', function (utils) {

			var NotificationManager = {
				_notifications: [],
				_genId: function (len) {
					var id = "", c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
					for (var i = 0; i < len; i++) id += c.charAt(Math.floor(Math.random() * c.length));
					return id;
				},
				_el: null,
				setup: function () {
					this._el = $('<div>').addClass('acit-notifications');
					$(document.body).append(this._el);
				},
				create: function (content) {
					var id = this._genId(32);
					var el = $('<div>').addClass('acit-notifications-notification').html(content);
					this._el.append(el);
					this._notifications.push({ id: id, el: el });
					return id;
				},
				update: function (id, content) {
					this._notifications.some(function (notification, i, notifications) {
						if (notification.id == id) {
							notification.el.html(content);
							return true;
						}
					});
				},
				clear: function (id) {
					var self = this;
					var notification = null;
					self._notifications.some(function (n) {
						if (n.id == id) { notification = n; return true; }
					});
					if (notification) {
						notification.el.fadeOut(500, function () {
							notification.el.css({ visibility: 'hidden', display: 'block' });
							notification.el.slideUp(250, function () {
								console.log('here!');
								//notification.el.remove();
								//self._notifications.splice(this._notifications.indexOf(notification), 1);
							});
						});
					}
				}
			};

			NotificationManager.setup();

			var test = NotificationManager.create('Hello world!');
			NotificationManager.create('Hello world 2!');
			window.setTimeout(function () { NotificationManager.clear(test); }, 1000);

			var TimerManager = {
				timers: [],
				menuElement: null,
				timerForMenu: null,
				requestUpdateTimer: null,
				mutationObserver: null,
				removeMenu: function (e) {
					if (TimerManager.timerForMenu) {
						TimerManager.timerForMenu.el.menu.css('display', '');
						TimerManager.menuElement.remove();
						TimerManager.menuElement = null;
						TimerManager.timerForMenu = null;
					}
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

						Server.do('getMenuProps', { project: project, task: task }, function (payload) {

							var jobTypeEl = $('<div>').addClass('task_panel_property').html([
								$('<label>').html('Job Type'),
								$('<select>')
									.addClass('acit-timer-menu-dropdown-select')
									.html(window.angie.collections.job_types.map(function (jobType) {
										return $('<option>').val(jobType.id).html(jobType.name).attr('selected', (payload.jobTypeId == jobType.id ? 'selected' : null));
									}))
									.change(function () {
										Server.do('timerSetJobType', {
											project: project,
											task: task,
											value: parseInt(this.value)
										});
									})
							]);

							var billableEl = $('<div>').addClass('task_panel_property').html([
								$('<label>').html('Billable'),
								$('<select>')
									.addClass('acit-timer-menu-dropdown-select')
									.html([
										$('<option>').val('1').html('Yes').attr('selected', (payload.billable ? 'selected' : null)),
										$('<option>').val('0').html('No').attr('selected', (!payload.billable ? 'selected' : null))
									])
									.change(function () {
										Server.do('timerSetBillable', {
											project: project,
											task: task,
											value: (this.value === '1')
										});
									})
							]);

							var timeEl = $('<div>').addClass('task_panel_property').html([
								$('<label>').html('Time'),
								$('<input>').addClass('acit-timer-menu-dropdown-input')
								.val(payload.formattedTime)
								.keyup(function (e) {
									var self = this;
									Server.do('timerSetTime', {
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

							var descriptionEl = $('<div>').addClass('task_panel_property').html([
								$('<label>').html('Description'),
								$('<textarea>').addClass('acit-timer-menu-dropdown-input').val(payload.summary).keyup(function (e) {
									Server.do('timerSetSummary', { project: project, task: task, value: this.value });
									e.preventDefault();
								}).dblclick(function (e) { e.stopPropagation(); e.preventDefault(); })
							]);

							var actionsEl = $('<div>').addClass('task_panel_actions').html([
								$('<a>').attr('href', "#").html('Submit').click(function () {
									TimerManager.submitTimer(project, task);
									TimerManager.removeMenu();
								}),
								$('<a>').attr('href', "#").html('Reset').click(function () {
									Server.do('timerStop', { project: project, task: task });
									TimerManager.removeMenu();
								})
							]);

							self.menuElement
								.addClass('acit-timer-menu-dropdown popover task_popover')
								.html([
									$('<div>').addClass('popover_arrow').css({ left: '50%' }),
									$('<div>').addClass('popover_inner').html(
										$('<div>').addClass('popover_content').html(
											$('<div>').addClass('task_panel_popover').attr('tabindex', 0).html([
												jobTypeEl, billableEl, timeEl, descriptionEl, actionsEl
											])
										)
									)
								]);
						});
					}
				},
				getSendableTimers: function () {
					var basicTimers = [];
					this.timers.forEach(function (timer) {
						basicTimers.push({ project: timer.project, task: timer.task });
					});
					return basicTimers;
				},
				checkTimerOnDOM: function (project, task) {
					return $.contains(document.body, this.getTimer(project, task).el.base[0]);
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

					timer.project = project;
					timer.task = task;

					timer.el.base = $('<div>');
					timer.el.menu = $('<button>');
					timer.el.time = $('<div>');

					parentEl.append(timer.el.base.html([timer.el.time, timer.el.menu]));

					timer.el.base.addClass('acit-timer');

					timer.el.menu
						.addClass('acit-timer-menu icon icon_options_dropdown_black')
						.click(function (e) {
							if (e.target != timer.el.menu[0]) return;
							e.stopPropagation();
							self.showMenu(project, task);
						});

					timer.el.time
						.addClass('acit-timer-time')
						.html('00:00')
						.click(function (e) {
							Server.do('timerClicked', { project: project, task: task });
							e.stopPropagation();
						});

					self.timers.push(timer);

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
							if (!timer) {
								self.addTimer(project, task, $(this).find('.task_view_mode').parent());
							}
							else if (!self.checkTimerOnDOM(project, task)) {
								timer.el.base.remove();
								self.timers.splice(self.timers.indexOf(timer), 1);
								self.addTimer(project, task, $(this).find('.task_view_mode').parent());
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
				},
				updateTimersProps: function (timers) {
					var self = this;
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
							timer.el.time.css({ backgroundColor: '#ff3c3c' });
							if (timer.el.time.html().indexOf(':') !== -1) {
								html = html.replace(':', ' ');
							}
						}
						else if (timer.state == 'paused') {
							timer.el.time.css({ backgroundColor: '#ffc637' });
						}
						else {
							html = "00:00";
							timer.el.time.css({ backgroundColor: '#44a6ff' });
						}
						timer.el.time.html(html);
					});
				},
				submitTimer: function (project, task) {
					var notificationId = NotificationManager.create('Submitting timer');
					Server.do('timerSubmittableData', { project: project, task: task }, function (payload) {
						payload.user_id = angie.user_session_data.logged_user_id;
						fetch('http://projects.drminc.com/api/v1/projects/' + project + '/time-records', {
							method: 'POST',
							credentials: 'include',
							headers: {
								'X-Angie-CsrfValidator': window.getCsrfCookie(),
								'Content-Type': 'application/json'
							},
							body: JSON.stringify(payload)
						})
						.then(function (response) { return response.json(); })
						.then(function (json) {
							Server.do('timerSubmitted', { project: project, task: task }, function () {
								NotificationManager.update(notificationId, 'Time successfully submitted!');
								window.setTimeout(function () {
									NotificationManager.clear(notificationId);
								}, 1500);
							});
						})
						.catch(function (ex) { throw new Error(ex); });
					});
				},
				requestUpdate: function (timeout) {
					var self = this;
					if (self.requestUpdateTimer) {
						window.clearTimeout(self.requestUpdateTimer);
						self.requestUpdateTimer = null;
					}
					self.requestUpdateTimer = window.setTimeout(function () {
						self.updateTimersList();
						Server.do('updateMe', {}, function (payload) {
							self.updateTimersProps(payload.timers);
						});
					}, timeout);
				},
				setupMutationObserver: function () {
					var self = this;
					self.mutationObserver = new MutationObserver(function (mutations) {
						mutations.some(function (mutation) {
							if (mutation.type == 'characterData' || mutation.type == 'attributes') return;
							if (mutation.target.className && mutation.target.className.indexOf('acit-timer') != -1) return;
							if (mutation.target.className && mutation.target.className.indexOf('timer')) {
								self.requestUpdate(100);
								return true;
							}
						});
					});
					self.mutationObserver.observe(document.body, { childList: true, attributes: true, characterData: true, subtree: true });
				}
			};

			TimerManager.setupMutationObserver();

			Server.on('update', function (payload) {
				TimerManager.updateTimersProps(payload.timers);
			});

			$(document.body).click(function (e) {
				if (TimerManager.timerForMenu && !$.contains(TimerManager.timerForMenu.el.base[0], e.target)) {
					TimerManager.removeMenu();
				}
			});

			window.setInterval(function () { TimerManager.renderTimers(); }, 1000);

			window.setTimeout(function () {
				// tell the extension what the job types for this ActiveCollab server are
				Server.do('sendJobTypes', { jobTypes: window.angie.collections.job_types }, function () {
					console.log('job types sent!');
				});
			}, 1000);

			window.TimerManager = TimerManager;
		});
	});

})();
