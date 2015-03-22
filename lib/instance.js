var util = require('util'),
	events = require('events'),
	error = require('./error'),
	ORMError = error.ORMError,
	ValidationError = error.ValidationError,
	_ = require('lodash');

util.inherits(Instance, events.EventEmitter);
module.exports = Instance;

function Instance(model, values, skipNotFound) {
	if (!model.fields) {
		throw new ORMError('missing model "fields" property');
	}
	this._values = {};
	this._model = model;
	this._dirty = false;
	this._deleted = false;
	this._metadata = {};
	this._dirtyfields = {};
	this._fieldmap = {};
	this._fieldmap_by_name = {};
	this._skipNotFoundFields = null;
	this._events = {};

	var self = this;
	['_values','_model','_dirty','_deleted','_metadata','_dirtyfields','_fieldmap','_fieldmap_by_name','_skipNotFoundFields','_events'].forEach(function(k){
		Object.defineProperty(self,k,{
			enumerable: false
		});
	});

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
			this._fieldmap_by_name[property] = field;
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
		if (_.isFunction(o)) {
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
	this._skipNotFoundFields = skipNotFound && Object.keys(values);

	// perform initial validation
	!skipNotFound && this.validateFields();
}

function isOK(value) {
	return !(value === undefined || value === null);
}

Instance.prototype.getModel = function getModel () {
	return this._model;
};

Instance.prototype.getConnector = function getConnector() {
	return this._model.getConnector();
};

Instance.prototype.validateCoersiveTypes = function validateCoersiveTypes(field, name, value) {
	var type = (typeof value).toLowerCase();
	switch (field.type.toLowerCase()) {
		case 'boolean': {
			if (type === 'number') {
				this.set(name, value >= 1);
				return true;
			}
			if (type === 'string') {
				switch (value.trim().toLowerCase()) {
					case 'false':
					case 'no':
					case '0':
						this.set(name, false);
						return true;
					case 'true':
					case 'yes':
					case '1':
						this.set(name, true);
						return true;
				}
			}
			break;
		}
		case 'number': {
			if (type === 'string') {
				var parsedInt = parseInt(value, 10);
				if (value == parsedInt) { // jshint ignore:line
					this.set(name, parsedInt);
					return true;
				}
				var parsedFloat = parseFloat(value);
				if (value == parsedFloat) { // jshint ignore:line
					this.set(name, parsedFloat);
					return true;
				}
			}
			break;
		}
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
			if (typeof(value)==='string' && value==='') {
				this.set(name,{});
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
		value = isOK(v) ? v : this.get(name),
		hasValue = isOK(value);
	if ((false===field.optional || field.required) && !hasValue) {
		throw new ValidationError(name,"required field value missing: "+name);
	}
	if (hasValue && field.type.toLowerCase() !== (typeof value).toLowerCase()) {
		if (!this.validateCoersiveTypes(field,name,value)) {
			throw new ValidationError(name,"invalid type ("+(typeof value)+") for field: "+name+". Should be "+field.type+". Value was: "+util.inspect(value));
		}
	}
	if (value !== undefined && value !== null && (_.isString(value) || _.isArray(value))) {
		if (field.minlength !== undefined && value.length < field.minlength) {
			throw new ValidationError(name, "field value must be at least " + field.minlength + " characters long: "+name);
		}
		if (field.maxlength !== undefined && value.length > field.maxlength) {
			throw new ValidationError(name, "field value must be at most " + field.maxlength + " characters long: "+name);
		}
		if (field.length !== undefined && value.length !== field.length) {
			throw new ValidationError(name, "field value must be exactly " + field.length + " characters long: "+name);
		}
	}
	if (field.validator) {
		// only run validators if required or if we have a value
		if (field.required || hasValue) {
			if (field.validator instanceof RegExp) {
				if (!field.validator.test(value)) {
					throw new ValidationError(name,'field "'+name+'" failed validation using expression "'+field.validator+'" and value: '+value);
				}
			} else if (typeof field.validator === 'function') {
				try {
					var msg = field.validator(value);
					if (msg) {
						throw new ValidationError(name,msg);
					}
				}
				catch (E) {
					if (E instanceof ValidationError) {
						throw E;
					}
					else {
						throw new ValidationError(name,E.message);
					}
				}
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

['primaryKey', 'ID', 'Id', 'id', '_id'].forEach(function (alias) {
	Object.defineProperty(Instance.prototype, alias, {
		get: Instance.prototype.getPrimaryKey,
		set: Instance.prototype.setPrimaryKey
	});
});

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
	var obj = {},
		fields = this._model.fields,
		pk = this.getPrimaryKey();
	// only add the primary key if we have one
	if (pk!==undefined) {
		obj.id = pk;
	}
	_.keys(this._values).forEach(function jsonIterator(key){
		// if we have skip fields, only return fields contained in the model - that what
		// if we query with sel or unsel, we only return a model that also contains those same
		// field keys (assuming it's not a calculated field)
		var field = fields[key];
		if (this._skipNotFoundFields &&
			this._skipNotFoundFields.indexOf(key)<0 &&
			// not custom and not primary key
			field && !field.custom && key!=='id' &&
			// if its not a custom mapped field name
			field.name === key) {
			return;
		}
		var v = this._model.get(key,this._values[key],this);
		if (!_.isFunction(v)) {
			if (v !== undefined) {
				// undefined means remove it
				obj[key] = v;
			}
		}
	}.bind(this));
	// allow the model to have a global serialize callback
	if (this._model.serialize) {
		obj = this._model.serialize(obj, this, this._model);
	}
	return obj;
};

Instance.prototype.toPayload = function toPayload() {
	var obj = {},
		fields = this._model.fields,
		values = this.values();
	for (var key in values) {
		/*if (values.hasOwnProperty(key) && values[key] !== null && !fields[key].custom) {
			obj[fields[key].name || key] = values[key];
		}*/
		if (values.hasOwnProperty(key) && !fields[key].custom) {
			obj[fields[key].name || key] = this._model.set(key,this._values[key],this);
		}
	}
	// allow the model to have a global deserialize callback
	if (this._model.deserialize) {
		obj = this._model.deserialize(obj, this, this._model);
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
	var field = this._model.fields[name],
		result,
		notfound = true;
	if (field && field.get) {
		var Model = require('./model');
		var fn = Model.toFunction(field,'get');
		result = fn(this._values[name], name, this);
		notfound = false;
	}
	if (undefined === result && name in this._values) {
		result = this._values[name];
		notfound = false;
	}
	if (_.isObject(result)) {
		// we need to return a cloned value otherwise if you mutate it and then attempt
		// to update it, will won't think it's changed when you call set
		result = _.cloneDeep(result);
	}
	if (!notfound) {
		return result;
	}
	else {
		throw new ORMError('field not found: '+name);
	}
};

/**
 * change a field with a new value. this will force the internal state to be dirty regardless of
 * whether the value is the same as what's already set
 */
Instance.prototype.change = function(name, value) {
	if (name in this._values) {
		this._values[name] = value;
		this._dirty = true;
		this._dirtyfields[name] = value;
	}
	else {
		throw new ORMError('field not found: '+name);
	}
};

/**
 * return the field names that have been changed
 */
Instance.prototype.getChangedFields = function getChangedFields() {
	return this._dirtyfields;
};

/**
 * return the values for the instance (excluding primary key and only include dirty if dirtyOnly)
 */
Instance.prototype.values = function values(dirtyOnly) {
	return _.pick(this._values, function(value,key) {
		var field = this._model.fields[key],
			isDirty = dirtyOnly && key in this._dirtyfields;
		if (field.readonly && isDirty) {
			return true;
		}
		else if (field.readonly && !isDirty) {
			return false;
		}
		return (!dirtyOnly || isDirty);
	}.bind(this));
};

/**
 * return the field keys for the instance
 */
Instance.prototype.keys = function keys() {
	return this._model.keys();
};

var internal = ['_dirty','_deleted','_metadata','_dirtyfields','_events','_values','_model','_fieldmap','_skipNotFoundFields'];
Instance.prototype.set = function set() {
	var skipNotFound;
	if (typeof(arguments[0])==='object') {
		var obj = arguments[0];
		skipNotFound = arguments[1];
		var keys = _.keys(obj);
		keys.forEach(function iterator(key){
			this.set(key, obj[key], skipNotFound);
		}.bind(this));
		if (skipNotFound) {
			// we need to remove any keys not found in the incoming payload
			// in case the user did a sel/unsel
			var removeKeys = _.difference(_.keys(this._values),keys);
			if (removeKeys.length) {
				removeKeys.forEach(function(k){
					if (!(k in this._fieldmap_by_name)) {
						// only undefine if not in the field mapping
						this._values[k] = undefined;
					}
				}.bind(this));
			}
		}
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
		if (!skipNotFound) {
			value = this._model.set(name,value,this);
		}

		if (/date/i.test(definition.type) && typeof value === 'string') {
			var dt = new Date(value);
			value = isNaN(dt) ? null : dt;
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
