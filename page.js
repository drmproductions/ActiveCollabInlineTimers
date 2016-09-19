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

			var TimerManager = {
				timers: [],
				menuElement: null,
				requestUpdateTimer: null,
				mutationObserver: null,
				showMenu: function (project, task) {
					// remove the old menu if it exists
					if (this.menuElement) {
						this.menuElement.remove();
						this.menuElement = null;
					}
					// create the new menu, if the timer exists
					var timer = this.getTimer(project, task);
					if (timer) {
						this.menuElement = $('<div>');
						timer.el.base.append([this.menuElement]);

						var jobTypesEls = [];
						window.angie.collections.job_types.forEach(function (job_type) {
							var selected = (jobTypeId == job_type.id ? 'selected' : null);
							jobTypesEls.push($('<option>').val(job_type.id).html(job_type.name).attr('selected', selected));
						});

						var jobTypeEl = $('<div>').addClass('task_panel_property').html([
							$('<label>').html('Job Type'),
							$('<select>')
								.addClass('acit-timer-menu-dropdown-select')
								.html(jobTypesEls)
								.change(function () {
									Server.do('setJobType', {
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
									$('<option>').val('1').html('Yes').attr('selected', (billable ? 'selected' : null)),
									$('<option>').val('0').html('No').attr('selected', (!billable ? 'selected' : null))
								])
								.change(function () {
									//self.billable = (this.value === '1');
									//self.save();
								})
						]);

						var timeEl = $('<div>').addClass('task_panel_property').html([
							$('<label>').html('Time'),
							$('<input>').addClass('acit-timer-menu-dropdown-input').val(self.getTimeString(true)).keyup(function (e) {
								this.style.outlineColor = (self.setTimeString(this.value) ? null : 'red');
								if (e.keyCode == 13) self.removeMenu();
								e.preventDefault();
							}).dblclick(function (e) { e.stopPropagation(); e.preventDefault(); })
						]);

						var descriptionEl = $('<div>').addClass('task_panel_property').html([
							$('<label>').html('Description'),
							$('<textarea>').addClass('acit-timer-menu-dropdown-input').val(self.summary).keyup(function (e) {
								self.summary = this.value;
								e.preventDefault();
							}).dblclick(function (e) { e.stopPropagation(); e.preventDefault(); })
						]);

						var actionsEl = $('<div>').addClass('task_panel_actions').html([
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
				submitTimer: function (project, task, data) {},
				requestUpdate: function (timeout) {
					console.log('requesting update');
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
				setupMutationObserver: function (which) {

					var self = this;

					if (self.mutationObserver) {
						self.mutationObserver.disconnect();
						self.mutationObserver = null;
					}

					var options = { childList: true, attributes: true, characterData: true, subtree: true };

					// set up the initial watcher at the root of the document
					if (which == 'initial') {
						var func = function (mutation) {
							if (mutation.target && mutation.target.className && mutation.target.className.indexOf('page_main_inner') !== -1) {
								self.setupMutationObserver('final');
							}
						};
						var el = document.body;
					}
					else if (which == 'final') {
						var func = function (mutation) {
							if (mutation.type == 'characterData' || mutation.type == 'attributes') return;
							if (mutation.target.className && mutation.target.className.indexOf('acit-timer') != -1) return;
							if (mutation.target.className && mutation.target.className.indexOf('timer')) {
								self.requestUpdate(100);
								return true;
							}
						};
						var el = document.getElementsByClassName('page_main_inner')[0];
					}

					if (func && el) {
						self.mutationObserver = new MutationObserver(function (mutations) { mutations.some(func); });
						self.mutationObserver.observe(el, options);
					}
				}
			};

			TimerManager.setupMutationObserver('initial');

			// tell the extension what the job types for this ActiveCollab server are
			Server.do('sendJobTypes', { jobTypes: window.angie.collections.job_types }, function () {
				console.log('job types sent!');
			});

			Server.on('update', function (payload) {
				TimerManager.updateTimersProps(payload.timers);
			});

			window.setInterval(function () { TimerManager.renderTimers(); }, 1000);

			window.TimerManager = TimerManager;
		});
	});

})();
