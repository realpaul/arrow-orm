var util = require('util'),
	_ = require('lodash'),
	events = require('events'),
	error = require('./error'),
	Model = require('./model');

module.exports = Collection;
util.inherits(Collection, events.EventEmitter);

function Collection(model, models) {
	if (!Array.isArray(models) && _.isObject(models)) {
		models = [models];
	}
	// check that the first entry is an object of type Instance
	if (models.length && !_.isFunction(models[0].getPrimaryKey)) {
		throw new error.ORMError('Collection only takes an array of Model instance objects');
	}
	// return an underscope wrapped object so we get nice functionality
	var ref = _(models);
	// the wrapped object needs to delegate back to this instance for emitters
	ref.on = this.on.bind(this);
	ref.emit = this.emit.bind(this);
	ref.removeListener = this.removeListener.bind(this);
	ref.removeAllListeners = this.removeAllListeners.bind(this);
	ref.add = this.add.bind(ref);
	ref.toArray = this.toArray.bind(ref);
	ref.get = this.get.bind(ref);

	// map this to make it an array
	for (var c=0;c<models.length;c++) {
		(function(index){
			Object.defineProperty(ref, String(c), {
				get: function() {
					return models[index];
				},
				set: function(value) {
					models[index]=value;
				}
			});
		})(c);
	}

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
	configurable: true,
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

Collection.prototype.toArray = function toArray() {
	var array = [];
	for (var c=0;c<this.__wrapped__.length;c++) {
		var obj = this.__wrapped__[c];
		array.push(obj);
	}
	return array;
};

Collection.prototype.get = function get(index) {
	return this.__wrapped__[index || 0];
};
