function getPrefs (cb) {
	chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
		chrome.storage.local.get(btoa(new URL(tabs[0].url).hostname), function (session) {
			cb(session.prefs ? session.prefs : {});
		});
	});
}

function savePrefs (prefs, cb) {
	chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
		var data = {};
		data[btoa(new URL(tabs[0].url).hostname)] = { prefs: prefs } };
		chrome.storage.local.set(data, cb);
	});
}

chrome.tabs.executeScript({ code: 'window.isActiveCollab;' }, function (results) {

	if (!results[0]) return;

	var manifest = chrome.runtime.getManifest();

	document.getElementById('no_injection').style.display = "none";
	document.getElementById('injection').style.display = "block";

	document.getElementById('default_job_type').addEventListener('change', function () {
		var value = this.value;
		getPrefs(function (prefs) {
			prefs.defaultJobType = value;
			savePrefs(prefs, function () {});
		});
	});

	document.getElementById('default_is_billable').addEventListener('change', function () {
		var value = (this.value === "1");
		getPrefs(function (prefs) {
			prefs.minimumEntry = value;
			savePrefs(prefs, function () {});
		});
	});

	document.getElementById('rounding_interval').addEventListener('change', function () {
		var value = this.value;
		getPrefs(function (prefs) {
			prefs.roundingInterval = value;
			savePrefs(prefs, function () {});
		});
	});

	document.getElementById('minimum_entry').addEventListener('change', function () {
		var value = this.value;
		getPrefs(function (prefs) {
			prefs.minimumEntry = value;
			savePrefs(prefs, function () {});
		});
	});

	getPrefs(function (prefs) {
		//if (prefs.defaultJobType) {}
	});
});
