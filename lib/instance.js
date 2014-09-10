var util = require('util'),
	events = require('events'),
	error = require('./error'),
	ORMError = error.ORMError,
	ValidationError = error.ValidationError,
	_ = require('lodash');

util.inherits(Instance, events.EventEmitter);
module.exports = Instance;

function Instance(model, values, skipNotFound) {
	this._values = {};
	this._model = model;
	this._dirty = false;
	this._deleted = false;
	this._metadata = {};

	// map our field properties into this instance
	Object.keys(model.fields).forEach(function(property){
		var field = model.fields[property];
		if (!field.type) {
			throw new ValidationError(property,"required type property missing for field");
		}
		if (!field.type.name) {
			field.type = String(field.type);
		}
		else {
			field.type = field.type.name.toLowerCase();
		}
		if (field.default) {
			this._values[property]=field.default;
		}
		Object.defineProperty(this, property, {
			get: function() {
				return this.get(property);
			},
			set: function(value){
				return this.set(property,value);
			}
		});
	}.bind(this));

	// set the values
	values && this.set(values,skipNotFound);

	// set dirty false when we are constructing
	this._dirty=false;

	// perform initial validation
	this.validateFields();
}

function isOK(value) {
	return !(value === undefined || value === null);
}

Instance.prototype.validateField = function validateField(name, v) {
	var field = this._model.fields[name],
		value = v || this.get(name),
		hasValue = isOK(value);
	if (field.required && !hasValue) {
		throw new ValidationError(name,"required field value missing: "+name);
	}
	if (hasValue && field.type !== typeof(value)) {
		throw new ValidationError(name,"invalid type ("+typeof(value)+") for field: "+name+". Should be "+field.type.name);
	}
	if (field.validator){
		if (field.validator instanceof RegExp) {
			if (!field.validator.test(value)) {
				throw new ValidationError(name,'field "'+name+'" failed validation using expression "'+field.validator+'" and value: '+value);
			}
		} else if (typeof field.validator === 'function') {
			var msg = field.validator(value);
			if (msg) {
				throw new ValidationError(name,msg);
			}
		}
	}
};

Instance.prototype.validateFields = function validateFields(){
	// map our field properties into this instance
	Object.keys(this._model.fields).forEach(function iterator(property){
		this.validateField(property);
	}.bind(this));
};

Instance.prototype.setPrimaryKey = function setPrimaryKey(value) {
	this.setMeta(Instance.PRIMARY_KEY, value);
};

Instance.prototype.getPrimaryKey = function getPrimaryKey() {
	return this.getMeta(Instance.PRIMARY_KEY);
};

Instance.prototype.setMeta = function setMeta(key, value) {
	this._metadata[key] = value;
	return this;
};

Instance.prototype.getMeta = function getMeta(key, def) {
	return this._metadata[key] || def;
};

Instance.prototype.inspect = function inspect() {
	return util.inspect(this._values);
};

Instance.prototype.toJSON = function toJSON() {
	return _.merge({'id':this.getPrimaryKey()}, this._values);
};

Instance.prototype.isUnsaved = function isUnsaved() {
	return this._dirty;
};

Instance.prototype.isDeleted = function isDeleted() {
	return this._deleted;
};

Instance.prototype.get = function get(name) {
	return this._values[name];
};

/**
 * return the values for the instance (excluding primary key)
 */
Instance.prototype.values = function() {
	return this._values;
};

/**
 * return the field keys for the instance
 */
Instance.prototype.keys = function() {
	return this._model.keys();
};

Instance.prototype.set = function set() {
	var skipNotFound;
	if (typeof(arguments[0])==='object') {
		var obj = arguments[0];
		skipNotFound = arguments[1];
		Object.keys(obj).forEach(function iterator(key){
			this.set(key, obj[key], skipNotFound);
		}.bind(this));
	}
	else {
		var name = arguments[0],
			value = arguments[1],
			definition = this._model.fields[name],
			current_value = this._values[name];

		skipNotFound = arguments[2];

		// don't set primary key, skip it
		if (name==='id') {
			return;
		}

		if (!definition && !skipNotFound) {
			throw new ValidationError(name,"invalid field: "+name);
		}
		else if (!definition && skipNotFound) {
			// don't set it if we can't find definition and
			// we have told it to skip these types of fields
			// this is useful when a connector wants to add
			// values from DB but filter by the Model field
			// definitions and skip others
			return this;
		}

		value = isOK(value) ? value : definition.default;

		// validate this field
		this.validateField(name,value);

		if (current_value!==value) {
			this._values[name] = value;
			this._dirty = true;
			this.emit('change:'+name,value,current_value);
		}
	}
	return this;
};

Instance.prototype.update =
Instance.prototype.save = function save(callback) {
	return this._model.update(this, callback);
};

Instance.prototype.delete =
Instance.prototype.remove = function remove(callback) {
	return this._model.delete(this, callback);
};

Instance.PRIMARY_KEY = 'primarykey';
