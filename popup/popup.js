console.log('popup.js loaded!');

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

window.addEventListener('DOMContentLoaded', function () {
	chrome.tabs.executeScript({ code: 'window.isActiveCollab;' }, function (results) {
		if (!results[0]) return;
		require(chrome.extension.getURL('utils.js'), function (utils) {

			var Server = {
				// sends a request to he server
				do: function (action, payload, cb) {
					if (!payload) payload = {};
					utils.currentTab(function (tab) {
						chrome.runtime.sendMessage({
							from: 'POPUP',
							hostname: new URL(tab.url).hostname,
							action: action,
							payload: payload
						}, function (response) {
							if (!response || !response.from || response.from != 'SERVER') return;
							if (typeof cb === 'function') cb(response.payload);
						});
					});
				}
			};

			var manifest = chrome.runtime.getManifest();

			document.getElementById('no_injection').style.display = "none";
			document.getElementById('injection').style.display = "block";

			Server.do('popup/content', {}, function (payload) {

				var prefEls = {
					jobTypeId: document.getElementById('pref_jobTypeId'),
					billable: document.getElementById('pref_billable'),
					roundingInterval: document.getElementById('pref_roundingInterval'),
					minimumEntry: document.getElementById('pref_minimumEntry')
				};

				var actionEls = {
					timersResetAllPages: document.getElementById('action_timersResetAllPages'),
					timersResetCurrentPage: document.getElementById('action_timersResetCurrentPage'),
					timersSubmitAllPages: document.getElementById('action_timersSubmitAllPages'),
					timersSubmitCurrentPage: document.getElementById('action_timersSubmitCurrentPage'),
				};

				prefEls.jobTypeId.addEventListener('change', function () {
					Server.do('session/prefs/set', { key: 'jobTypeId', value: parseInt(this.value) });
				});

				prefEls.billable.addEventListener('change', function () {
					Server.do('session/prefs/set', { key: 'billable', value: (this.value === "1") });
				});

				prefEls.roundingInterval.addEventListener('change', function () {
					Server.do('session/prefs/set', { key: 'roundingInterval', value: parseInt(this.value) });
				});

				prefEls.minimumEntry.addEventListener('change', function () {
					Server.do('session/prefs/set', { key: 'minimumEntry', value: parseInt(this.value) });
				});

				actionEls.timersResetAllPages.addEventListener('click', function () {
					Server.do('timers/reset/all', null, function() {
						window.close();
					});
				});

				actionEls.timersResetCurrentPage.addEventListener('click', function () {
					Server.do('timers/reset/current', null, function() {
						window.close();
					});
				});

				actionEls.timersSubmitAllPages.addEventListener('click', function () {
					Server.do('timers/submit/all', null, function() {
						window.close();
					});
				});

				actionEls.timersSubmitCurrentPage.addEventListener('click', function () {
					Server.do('timers/submit/current', null, function() {
						window.close();
					});
				});

				payload.jobTypes.forEach(function (jobType) {
					var el = document.createElement('option');
					el.value = jobType.id;
					el.innerHTML = jobType.name;
					prefEls.jobTypeId.appendChild(el);
				});

				prefEls.jobTypeId.value = payload.prefs.jobTypeId;
				prefEls.billable.value = (payload.prefs.billable == true) ? '1' : '0';
				prefEls.roundingInterval.value = payload.prefs.roundingInterval;
				prefEls.minimumEntry.value = payload.prefs.minimumEntry;
			});

		});
	});
});
