module.exports = {

	getTimer: function (timers, project, task) {
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
	},

	getDefaultJobTypeId: function (session) {

		var defaultJobTypeId = null;

		// if session.prefs.jobTypeId is set, but it's not a jobType anymore, we use the lowest job type available
		session.jobTypes.some(function (jobType) {
			// use the jobtype in our prefs if its set
			if (jobType.id == session.prefs.jobTypeId) {
				defaultJobTypeId = session.prefs.jobTypeId;
				return true;
			}
			// otherwise we use the lowest jobtype
			if (defaultJobTypeId == null || jobType.id < defaultJobTypeId) {
				defaultJobTypeId = jobType.id;
			}
		});

		return defaultJobTypeId;
	},

	timeStringValid: function (timeString) {

		var split = timeString.split(':');

		if (split.length != 2) return false;

		var hours = parseInt(split[0]);
		var mins = parseInt(split[1]);

		if (isNaN(hours) || isNaN(mins)) return false;
		if (hours > 23) return false;
		if (mins > 59) return false;

		return true;
	},

	setTimerTimeFromString: function (timer, timeString) {

		if (!this.timeStringValid(timeString)) return false;

		var split = timeString.split(':');
		var hours = parseInt(split[0]);
		var mins = parseInt(split[1]);

		if (hours == 0 && mins == 0) {
			timer.total = 0;
			timer.start = 0;
			timer.state = 'stopped';
			return true;
		}

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
	},

	currentTab: function (cb) {
		chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) { cb(tabs[0]); });
	},

	activeCollabDateString: function (date) {
		var y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
		m = (m.toString().length == 1) ? '0' + m : m;
		d = (d.toString().length == 1) ? '0' + d : d;
		return y + "-" + m + "-" + d;
	},

	totalTime: function (timer, roundBy, minimumValue, removeSeconds) {

		var total = timer.total + (timer.state == 'running' ? (Date.now() - timer.start) : 0);

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

	formattedTime: function (timer, roundBy, minimumValue) {

		var time = this.totalTime(timer, roundBy, minimumValue, true), text = '';

		var d = new Date(time);

		var h = d.getUTCHours().toString();
		var m = d.getUTCMinutes().toString();

		h = (h.length == 1 ? '0' + h : h);
		m = (m.length == 1 ? '0' + m : m);

		return h + ':' + m;
	},

	copyArray: function (arr) {
		return arr.map(function (obj) { return Object.assign({}, obj) });
	},

	getSendableTimers: function (timers) {
		var sendableTimers = [];
		timers.forEach(function (timer) {
			sendableTimers.push({ project: timer.project, task: timer.task });
		});
		return sendableTimers;
	},

	waterfall: function (funcs, cb) {
		var i = 0, next = function () {

			var args = [];
			Array.prototype.push.apply(args, arguments);

			if (args.length < 1) args.push(null);

			// return right away if there was an error while running the last func
			var err = args.shift();
			if (err !== null) return cb(err);

			// call the cb when we're done with all the funcs
			if (i == funcs.length) {
				return cb.apply(this, [null].concat(args));
			}

			// call the next func, passing it the next
			// variable, and the previous funcs passed arguments
			funcs[i++].apply(this, [next].concat(args));

		}; next(null);
	}
};
