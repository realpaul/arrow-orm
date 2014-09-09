var util = require('util'),
	_ = require('lodash'),
	events = require('events');

module.exports = Collection;
util.inherits(Collection, events.EventEmitter);

function Collection(model, models) {
	// return an underscope wrapped object so we get nice functionality
	var ref = _(models);
	// the wrapped object needs to delegate back to this instance for emitters
	ref.on = this.on.bind(this);
	ref.emit = this.emit.bind(this);
	ref.removeListener = this.removeListener.bind(this);
	ref.removeAllListeners = this.removeAllListeners.bind(this);
	ref.add = this.add.bind(ref);

	return ref;
}

Object.defineProperty(_.prototype,'length',{
	get: function() {
		return this.__wrapped__.length;
	},
	set: function(value){
		// trim to the value passed in
		this.__wrapped__.splice(value || 0);
		return this;
	},
	enumerable: false
});

_.prototype.inspect = function inspect() {
	return util.inspect(this.__wrapped__);
};

_.prototype.toJSON = function toJSON() {
	return this.__wrapped__;
};

Collection.prototype.add = function add(model) {
	if (Array.isArray(model)) {
		return model.forEach(function iterator(row){
			this.add(row);
		}.bind(this));
	}
	this.__wrapped__.push(model);
};
