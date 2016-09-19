(function () {

	var ACIT = {
		prefs: {
			get: function (key, cb) {
				chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
					chrome.tabs.sendMessage(tabs[0].id, { from: "POPUP", payload: { action: 'get', key: key } }, function (payload) {
						cb(payload.value);
					});
				});
			},
			set: function (key, value, cb) {
				chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
					chrome.tabs.sendMessage(tabs[0].id, { from: "POPUP", payload: { action: 'set', key: key, value: value } }, cb);
				});
			}
		},
		getJobTypes: function (cb) {
			chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
				chrome.tabs.sendMessage(tabs[0].id, { from: "POPUP", payload: { action: 'getJobTypes' } }, function (payload) {
					cb(payload.jobTypes);
				});
			});
		}
	};

	function waterfall (funcs, cb) {
		var i = 0, next = function () { if (i == funcs.length) cb(); else funcs[i++](next); }; next();
	}

	function populateJobTypeSelect (jobTypes, defaultJobType) {
		var parentEl = document.getElementById('default_job_type');
		parentEl.innerHTML = "";

		jobTypes.forEach(function (jobType) {
			var el = document.createElement('option');
			el.value = jobType.id;
			el.innerHTML = jobType.name;
			if (jobType.id == defaultJobType) el.setAttribute('selected', 'selected');
			parentEl.appendChild(el);
		});
	}

	window.addEventListener('DOMContentLoaded', function () {

		var manifest = chrome.runtime.getManifest();

		chrome.tabs.executeScript({ code: 'window.injected;' }, function (results) {

			if (!results[0]) return;

			document.getElementById('no_injection').style.display = "none";
			document.getElementById('injection').style.display = "block";

			document.getElementById('default_job_type').addEventListener('change', function () {
				ACIT.prefs.set('defaultJobType', this.value, function () {});
			});

			document.getElementById('default_is_billable').addEventListener('change', function () {
				ACIT.prefs.set('defaultIsBillable', (this.value === "1"), function () {});
			});

			document.getElementById('rounding_interval').addEventListener('change', function () {
				ACIT.prefs.set('roundingInterval', this.value, function () {});
			});
			
			document.getElementById('minimum_entry').addEventListener('change', function () {
				ACIT.prefs.set('minimumEntry', this.value, function () {});
			});
			
			var defaultJobType, defaultIsBillable, roundingInterval, minimumEntry, jobTypes;

			waterfall([
				function (next) { ACIT.prefs.get('defaultJobType', function (value) { defaultJobType = value; next(); }) },
				function (next) { ACIT.prefs.get('defaultIsBillable', function (value) { defaultIsBillable = value; next(); }) },
				function (next) { ACIT.prefs.get('roundingInterval', function (value) { roundingInterval = value; next(); }) },
				function (next) { ACIT.prefs.get('minimumEntry', function (value) { minimumEntry = value; next(); }) },
				function (next) { ACIT.getJobTypes(function (value) { jobTypes = value; next(); }) }
			], function () {

				// use the users preferences, or set defaults
				waterfall([
					function (next) {
						if (defaultJobType !== null) {
							populateJobTypeSelect(jobTypes, defaultJobType);
							next();
						}
						else {
							var firstJobType = null;
							jobTypes.forEach(function (jobType) {
								if (firstJobType == null || jobType.id < firstJobType.id) firstJobType = jobType;
							});
							ACIT.prefs.set('defaultJobType', firstJobType.id, function () {
								populateJobTypeSelect(jobTypes, firstJobType.id);
							});
							next();
						}
					},
					function (next) {
						if (defaultIsBillable !== null) {
							document.getElementById('default_is_billable').value = (defaultIsBillable ? '1' : '0');
							next();
						}
						else {
							ACIT.prefs.set('defaultIsBillable', true, function () {
								document.getElementById('default_is_billable').value = '1';
								next();
							});
						}
					},
					function (next) {
						if (roundingInterval !== null) {
							document.getElementById('rounding_interval').value = roundingInterval;
							next();
						}
						else {
							ACIT.prefs.set('roundingInterval', 0, function () {
								document.getElementById('rounding_interval').value = 0;
								next();
							});
						}
					},
					function (next) {
						if (minimumEntry !== null) {
							document.getElementById('minimum_entry').value = minimumEntry;
							next();
						}
						else {
							ACIT.prefs.set('minimumEntry', 0, function () {
								document.getElementById('minimum_entry').value = 0;
								next();
							});
						}
					}
				], function () {
						
				});
			});
		});

	});
})();
