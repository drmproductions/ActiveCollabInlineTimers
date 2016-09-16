// injects the code if we've been notified that the tab is an ActiveCollab tab

chrome.runtime.onMessage.addListener(function(request, sender, respond) {
	if (request && request.from === 'CHECK_INTERNAL' && request.payload && request.payload.inject === true) {
		console.log('Injecting ActiveCollabInlineTimers code');
		chrome.tabs.executeScript(sender.tab.id, { file: "timer/internal.js" });
		chrome.tabs.insertCSS(sender.tab.id, { file: "timer/internal.css" });
	}
	respond({ from: 'CHECK_EXTERNAL' });
});

