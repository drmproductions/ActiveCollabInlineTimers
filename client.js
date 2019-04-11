
// only set everything up if this page is an activecollab page
if (Array.prototype.slice.call(document.getElementsByTagName('script')).some(function (scriptEl) {
	return !(['activecollab', '/api/v1', 'activecollab_csrf', 'angie.api_url'].some(function (val) {
		if (scriptEl.innerHTML.toLowerCase().indexOf(val) === -1) return true;
	}))
})) {

	window.isActiveCollab = true;

	// listen for messages from the popup
	chrome.runtime.onMessage.addListener(function (request, sender, respond) {
		if (!request || !(request.from === 'SERVER' || request.from === 'POPUP') || !request.payload) return;
		request.from = 'CLIENT_EXTERNAL';
		window.postMessage(request, "*");
	});

	// setup direct message passing from CLIENT_INTERNAL to the main extension background process
	window.addEventListener('message', function (event) {
		if (event.source != window || !event.data.from || event.data.from != 'CLIENT_INTERNAL') return;

		const data = JSON.parse(JSON.stringify(event.data));
		data.from = 'CLIENT_EXTERNAL';

		chrome.runtime.sendMessage(data, function (response) {
			if (!response || !response.from || response.from != 'SERVER' || !response.payload) return;
			response.from = 'CLIENT_EXTERNAL';
			window.postMessage(response, "*");
		});
	}, false);

	// inject the javascript
	var script = document.createElement('script');
	script.src = chrome.extension.getURL('page.js');
	document.body.appendChild(script);

	// inject the css
	var styles = document.createElement('link');
	styles.href = chrome.extension.getURL('page.css');
	styles.rel = 'stylesheet';
	styles.type = 'text/css';
	document.head.appendChild(styles);
}
