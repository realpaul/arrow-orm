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
	this._dirtyfields = {};
	this._fieldmap = {};

	// map our field properties into this instance
	Object.keys(model.fields).forEach(function instanceIterator(property){
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
		else {
			this._values[property]=null;
		}
		if (field.name) {
			this._fieldmap[field.name] = property;
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

	// map in the methods from the Model on to the instance
	model.methods && Object.keys(model.methods).forEach(function modelMethodIterator(name){
		var o = model.methods[name];
		if (typeof(o)==='function') {
			this[name] = o.bind(this);
		}
		else {
			this[name] = o;
		}
	}.bind(this));

	// set the values
	values && this.set(values,skipNotFound);

	// set dirty false when we are constructing
	this._dirty=false;
	this._dirtyfields = {};

	// perform initial validation
	!skipNotFound && this.validateFields();
}

function isOK(value) {
	return !(value === undefined || value === null);
}

Instance.prototype.getModel = function getModel () {
	return this._model;
};

Instance.prototype.validateCoersiveTypes = function validateCoersiveTypes(field, name, value) {
	var type = typeof(value).toLowerCase();
	switch (field.type.toLowerCase()) {
		case 'date': {
			if (type === 'number') {
				this.set(name, new Date(value));
				return true;
			}
			else if (value instanceof Date) {
				return true;
			}
			break;
		}
		case 'object': {
			if (value instanceof Date) {
				return true;
			}
			break;
		}
		case 'array': {
			if (Array.isArray(value)) {
				return true;
			}
			break;
		}
	}
	return false;
};

Instance.prototype.validateField = function validateField(name, v) {
	var field = this._model.fields[name],
		value = v || this.get(name),
		hasValue = isOK(value);
	if (field.required && !hasValue) {
		throw new ValidationError(name,"required field value missing: "+name);
	}
	if (hasValue && field.type.toLowerCase() !== (typeof value).toLowerCase()) {
		if (!this.validateCoersiveTypes(field,name,value)) {
			throw new ValidationError(name,"invalid type ("+(typeof value)+") for field: "+name+". Should be "+field.type+". Value was: "+util.inspect(value));
		}
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
	return util.inspect(this.toJSON());
};

Instance.prototype.toJSON = function toJSON() {
	var obj = { id : this.getPrimaryKey() };
	_.keys(this._values).forEach(function jsonIterator(key){
		obj[key] = this._values[key];
	}.bind(this));
	return obj;
};

Instance.prototype.toPayload = function toPayload() {
	var obj = {},
		fields = this._model.fields,
		values = this.values();
	for (var key in values) {
		if (values.hasOwnProperty(key) && values[key] !== null) {
			obj[fields[key].name || key] = values[key];
		}
	}
	return obj;
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
 * return the field names that have been changed
 */
Instance.prototype.getChangedFields = function getChangedFields() {
	return this._dirtyfields;
};

/**
 * return the values for the instance (excluding primary key and any readonly fields)
 */
Instance.prototype.values = function values(dirtyOnly) {
	return _.pick(this._values, function(value,key) {
		return !this._model.fields[key].readonly &&
			(!dirtyOnly || (dirtyOnly && this._dirtyfields[key]));
	}.bind(this));
};

/**
 * return the field keys for the instance
 */
Instance.prototype.keys = function keys() {
	return this._model.keys();
};

var internal = ['_dirty','_deleted','_metadata','_dirtyfields','_events','_values','_model','_fieldmap'];
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
		var name = arguments[0];

		// if internal, we can skip
		if (name.charAt(0)==='_') {
			if (internal.indexOf(name)!==-1) {
				return;
			}
		}
		skipNotFound = arguments[2];

		// see if we have a field remapping
		if (name in this._fieldmap) {
			name = this._fieldmap[name];
		}

		var value = arguments[1],
			definition = this._model.fields[name],
			current_value = this._values[name];


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
		if (!skipNotFound && definition.readonly) {
			throw new ValidationError(name,"cannot set read-only field: "+name);
		}

		value = isOK(value) ? value : definition.default;

		// do serialization
		if (skipNotFound) {
			value = this._model.serialize(name,value,this);
		}
		else {
			value = this._model.deserialize(name,value,this);
		}

		// model linkage, we need to turn this value into an object
		if (definition.model) {
			// since we have a cyclic dependency, load here instead of globally
			var Model = require('./model'),
				Collection = require('./collection'),
				LinkedModel = Model.getModel(definition.model),
				connector = LinkedModel.connector;
			if (!LinkedModel) {
				throw new ValidationError(name,"invalid model reference");
			}
			if (Array.isArray(value)) {
				// make a collection
				var rows = [];
				value.forEach(function modelIterator(row){
					var instance = LinkedModel.instance(row,true);
					instance.setPrimaryKey(connector.getPrimaryKey(LinkedModel,row));
					rows.push(instance);
				});
				value = new Collection(LinkedModel,rows);
			}
			else if (_.isObject(value)) {
				// make a single instance
				if (value instanceof Instance) {
					// it's an instance, we need to convert it into an object
					value = value.values();
				}
				var pk = connector.getPrimaryKey(LinkedModel,value);
				value = LinkedModel.instance(value,true);
				value.setPrimaryKey(pk);
			}
			else {
				throw new ValidationError(name,"model linked to a non-object");
			}
		}

		// validate this field
		!skipNotFound && this.validateField(name,value,skipNotFound);

		if (current_value!==value) {
			this._values[name] = value;
			this._dirty = true;
			this._dirtyfields[name] = value;
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
