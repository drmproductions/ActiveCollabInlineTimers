// tells the extension whether or not the current page is an ActiveCollab page by looking at the pages script contents 

if (Array.prototype.slice.call(document.getElementsByTagName('script')).some(function (scriptEl) {
	return !(['activecollab', '/api/v1', 'ac_ActiveCollab_csrf', 'angie.api_url'].some(function (val) {
		if (scriptEl.innerHTML.indexOf(val) === -1) return true;
	}))
})) {
	console.log('Is an Activecollab page');
	chrome.runtime.sendMessage({ from: 'CHECK_INTERNAL', payload: { inject: true } });
}
else {
	console.log('Not an Activecollab page');
}
