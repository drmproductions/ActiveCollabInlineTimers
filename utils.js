module.exports = {

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
	}
};
