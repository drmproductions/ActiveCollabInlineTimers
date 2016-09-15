(function () {

	var ACIT = {
		prefs: {
			get: function (key, cb) {
				chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
					chrome.tabs.sendMessage(tabs[0].id, { action: 'get', key: key }, function (payload) {
						cb(payload.value);
					});
				});
			},
			set: function (key, value, cb) {
				chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
					chrome.tabs.sendMessage(tabs[0].id, { action: 'set', key: key, value: value }, cb);
				});
			}
		},
		getJobTypes: function (cb) {
			chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
				chrome.tabs.sendMessage(tabs[0].id, { action: 'getJobTypes' }, function (payload) {
					cb(payload.jobTypes);
				});
			});
		}
	};

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

		document.getElementById('extension_info').innerHTML = "version " + manifest.version + " | by " + manifest.author;

		chrome.tabs.executeScript({ code: 'window.injected;' }, function (results) {

			if (!results[0]) return;

			document.getElementById('info').style.display = "none";
			document.getElementById('user_prefs').style.display = "block";

			document.getElementById('default_job_type').addEventListener('change', function () {
				ACIT.prefs.set('defaultJobType', this.value, function () {});
			});

			ACIT.prefs.get('defaultJobType', function (defaultJobType) {
				ACIT.getJobTypes(function (jobTypes) {
					if (defaultJobType !== null) {
						populateJobTypeSelect(jobTypes, defaultJobType);
					}
					// set the defaultJobType to the lowest id
					else {
						var firstJobType = null;
						jobTypes.forEach(function (jobType) {
							if (firstJobType == null || jobType.id < firstJobType.id) firstJobType = job_type;
						});
						ACIT.prefs.set('defaultJobType', firstJobType.id, function () {
							populateJobTypeSelect(jobTypes, defaultJobType);
						});
					}
				});
			});
		});

	});
})();
