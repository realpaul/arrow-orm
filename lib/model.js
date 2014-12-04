var util = require('util'),
	events = require('events'),
	_ = require('lodash'),
	async = require('async'),
	Instance = require('./instance'),
	error = require('./error'),
	ORMError = error.ORMError,
	ValidationError = error.ValidationError,
	Collection = require('./collection'),
	models = [],
	ModelClass = new events.EventEmitter();

util.inherits(Model, events.EventEmitter);
module.exports = Model;

function Model(name, definition, skipValidation){
	this.name = name;
	this.fields = definition && definition.fields;
	this.connector = definition && definition.connector;
	this.metadata = definition && definition.metadata || {};
	this.mappings = definition && definition.mappings || {};
	this.actions = definition && validateActions(definition.actions) || VALID_ACTIONS;
	this.autogen = definition ? definition.autogen===undefined ? true : definition.autogen : true;

	if (!skipValidation && !definition) {
		throw new ORMError("missing required definition");
	}
	if (!skipValidation && this.fields.id) {
		throw new ValidationError('id',"id is a reserved field name for the generated primary key");
	}

	// pull out any method definitions
	this.methods = definition && _.omit(definition,'name','fields','connector','metadata','mappings','actions');
	this._wireMethods();

	if (models.indexOf(this)===-1) {
		models.push(this);
		ModelClass.emit('register',this);
	}

}

const VALID_ACTIONS = ['create','read','update','delete'];

function validateActions(actions) {
	if (actions===undefined || actions===null) { return null; }
	if (!Array.isArray(actions)) {
		throw new ORMError("actions must be an array with one or more of the following: "+VALID_ACTIONS.join(', '));
	}
	for (var c=0;c<actions.length;c++) {
		if (VALID_ACTIONS.indexOf(actions[c]) < 0) {
			throw new ORMError("invalid action `"+actions[c]+"` must be an array with one or more of the following: "+VALID_ACTIONS.join(', '));
		}
	}
	return actions;
}

Model.prototype._wireMethods = function _wireMethods() {

	// Bind functions.
	for (var name in this) {
		var fn = this[name];
		if (_.isFunction(fn)) {
			this[name] = fn.bind(this);
		}
		else {
			this[name] = fn;
		}
	}

	// Bind method functions.
	_.each(_.keys(this.methods), function wireMethodIterator(name) {
		var fn = this.methods[name];
		if (_.isFunction(fn)) {
			this[name] = fn.bind(this);
		}
		else {
			this[name] = fn;
		}
	}.bind(this));

};

Model.getModels = function getModels() {
	return models;
};

/**
 * return a specific model by name
 */
Model.getModel = function getModel(name) {
	for (var c=0;c<models.length;c++) {
		if (models[c].name === name) {
			return models[c];
		}
	}
};

Model.on = function on(){
	ModelClass.on.apply(ModelClass, arguments);
};

Model.removeListener = function removeListener(){
	ModelClass.removeListener.apply(ModelClass, arguments);
};

Model.removeAllListeners = function removeAllListeners(){
	ModelClass.removeAllListeners.apply(ModelClass, arguments);
};

// NOTE: this is internal and only used by the test and should never be called directly
Model.clearModels = function clearModels() {
	models.length = 0;
};

/**
 * check for a valid connector and return it, throwing an ORMError
 * if the connector isn't set of model
 */
Model.prototype.getConnector = function getConnector(dontRaiseException) {
	if (!this.connector && !dontRaiseException) {
		throw new ORMError("missing required connector");
	}
	return this.connector;
};

/**
 * set the connector for the model
 */
Model.prototype.setConnector = function setConnector(connector) {
	this.connector = connector;
};

Model.prototype.createRequest = function createRequest(request) {
	var promise = this.getConnector().createRequest(request);
	var model = new Model(this.name, null, true);
	model.fields = this.fields;
	model.connector = promise;
	model.login = promise.login;
	model.metadata = this.metadata;
	model.methods = this.methods;
	model.mappings = this.mappings;
	model.autogen = this.autogen;
	model.actions = this.actions;
	model._wireMethods();
	return model;
};

/**
 * define or extend a new Model instance
 */
Model.extend =
Model.define = function define(name, definition) {
	return new Model(name, definition);
};

/**
 * create a new Model which extends the current model instance
 */
Model.prototype.extend = function extend(name, definition) {
	var model;
	if (typeof name === 'string') {
		model = new Model(name, definition, true);
	}
	else if (name instanceof Model) {
		model = name;
	}
	else {
		throw new ORMError("invalid argument passed to extend. Must either be a model class or model definition");
	}
	model.metadata = _.merge(_.cloneDeep(this.metadata),model.metadata);
	model.mappings = _.merge(_.cloneDeep(this.mappings),model.mappings);
	if (model.fields) {
		var fields = this.fields;
		// allow the extending model to just specify the fields keys and pull out
		// the actual values from the extended model field (or merge them)
		Object.keys(model.fields).forEach(function(name){
			if (name in fields) {
				model.fields[name] = _.merge(_.cloneDeep(fields[name]), model.fields[name]);
			}
		});
	}
	else {
		model.fields = _.cloneDeep(this.fields);
	}
	model.connector = model.connector || this.connector;
	model.methods = _.merge(_.cloneDeep(this.methods),model.methods);
	model.autogen = this.autogen;
	model.actions = this.actions;
	model._wireMethods();
	return model;
};

/**
 * create a new Model object.
 *
 * @param {Array|Object} if array, creates all objects and returns collection, else creates one instance
 */
Model.prototype.create = function create(values, callback) {
	if (typeof values === 'function') {
		callback = values;
		values = {};
	}
	// if we have an array of values, create all the users in one shot
	// TODO: we might want to optimize this on the Connector interface
	// in the case of a DB, you want to send them in batch
	if (Array.isArray(values)) {
		var tasks = [],
			self = this;
		values.forEach(function iterator(v){
			tasks.push(function task(next){
				self.connector.create(self,v,next);
			});
		});
		return async.series(tasks,function seriesCallback(err,results){
			if (err) { return callback(err); }
			var collection = new Collection(self,results);
			callback(null, collection);
		});
	}
	try {
		this.getConnector().create(this, values, callback);
	}
	catch (E) {
		if (E instanceof ORMError) {
			return callback(E);
		}
		throw E;
	}
};

/**
 * return an instance of this Model
 */
Model.prototype.instance = function instance(values, skipNotFound) {
	return new Instance(this, values, skipNotFound);
};

/**
 * save or update Model instance
 */
Model.prototype.update =
Model.prototype.save = function save(instance, callback) {
	if (instance._deleted) {
		callback && callback(new ORMError('instance has already been deleted'));
		return;
	}
	if (!(instance instanceof Instance) || instance._dirty) {
		this.getConnector().save(this, instance, function saveCallback(err,result){
			if (err) { return callback && callback(err); }
			if (result) {
				result._dirty = false;
				result.emit('save');
			}
			callback && callback(null,result);
		});
	}
	else {
		callback && callback();
	}
};

/**
 * remove instance
 */
Model.prototype.delete =
Model.prototype.remove = function remove(instance, callback) {
	if (typeof(instance)==='object' && instance._deleted) {
		return callback && callback(new ORMError('instance has already been deleted'));
	}
	// if we specified a non-Instance, we need to findOne to get the instance
	// and then delete it
	if (typeof(instance)!=='object') {
		return this.getConnector().findOne(this, instance, function findOneCallback(err,instance){
			if (err) { return callback(err); }
			if (!instance) { return callback("trying to remove, couldn't find "+instance+" in "+this.name); }
			this.remove(instance, callback);
		}.bind(this));
	}
	this.getConnector().delete(this, instance, function deleteCallback(err,result){
		if (err) { return callback && callback(err); }
		if (result) {
			result._deleted = true;
			result.emit('delete');
		}
		callback && callback(null,result);
	});
};

/**
 * delete all the rows
 */
Model.prototype.deleteAll =
Model.prototype.removeAll = function removeAll(callback) {
	this.getConnector().deleteAll(this, callback);
};


/**
 * find one instance using primary key
 */
Model.prototype.findOne = function findOne(id, callback) {
	this.getConnector().findOne(this, id, callback);
};

/**
 * find all instances
 */
Model.prototype.findAll = function findAll(callback) {
	this.getConnector().findAll(this, callback);
};

/**
 * find all instances
 */
Model.prototype.query = function query(options, callback) {
	this.getConnector().query(this, options, callback);
};

/**
 * find instances matching properties.  if value is an id, operates as
 * a findOne.  if value is a callback function, operates as a findAll.
 * if value is an object of key/values, only returns instances matching
 * the values of keys.
 */
Model.prototype.fetch =
Model.prototype.find = function find() {

	switch (arguments.length) {
		case 1: {
			return this.findAll(arguments[0]);
		}
		case 2: {
			var options = arguments[0],
				callback = arguments[1];
			if (_.isObject(options)) {
				// Did they just pass in some fields and their values? Wrap it before passing to query.
				if (!options.where && !options.sel && !options.unsel && !options.page && !options.per_page && !options.sort && !options.skip && !options.limit) {
					options = { where: options };
				}
				parseProperties(options);
				return this.getConnector().query(this, options, callback);
			}
			return this.findOne(options, callback);
		}
		default: {
			throw new Error("wrong number of parameters passed");
		}
	}
};

/**
 * return connector metadata
 */
Model.prototype.getMeta = function getMeta(key, def) {
	var connector = this.getConnector();
	var entry = this.metadata[connector.name];
	return entry && entry[key] || def || null;
};

/**
 * set metadata for the connector
 */
Model.prototype.setMeta = function setMeta(key, value) {
	var connector = this.getConnector();
	var entry = this.metadata[connector.name];
	if (!entry) {
		entry = this.metadata[connector.name] = {};
	}
	entry[key] = value;
};

/**
 * return the field keys for the Model
 */
Model.prototype.keys = function keys() {
	return Object.keys(this.fields);
};

/**
 * called to serialize a field. will allow model definitions to
 * provide a mapping function
 */
Model.prototype.serialize = function serialize(name, value, instance) {
	var mapper = this.mappings[name] || this.fields[name];
	if (mapper) {
		var fn = mapper.serialize;
		if (fn) {
			return fn(value, name, instance);
		}
	}
	return value;
};

/**
 * called to deserialize a field. will allow model definitions to
 * provide a mapping function
 */
Model.prototype.deserialize = function serialize(name, value, instance) {
	var mapper = this.mappings[name] || this.fields[name];
	if (mapper) {
		var fn = mapper.deserialize;
		if (fn) {
			return fn(value, name, instance);
		}
	}
	return value;
};


/*
 Utility.
 */

function parseProperties(object) {
	for (var key in object) {
		if (object.hasOwnProperty(key)) {
			var val = object[key];
			if (val && typeof val === 'string' && val[0] === '{') {
				try {
					val = JSON.parse(val);
					object[key] = val;
				}
				catch(err) {
					if (key === 'where') {
						err.message = 'Failed to parse "where" as JSON: ' + err.message;
						throw err;
					}
				}
			}
		}
	}
}