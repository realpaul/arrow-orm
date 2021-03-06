/**
 * @class Arrow.Model
 */
var util = require('util'),
	events = require('events'),
	_ = require('lodash'),
	async = require('async'),
	pluralize = require('pluralize'),
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

	var ModelFields = ['name', 'fields', 'connector', 'metadata', 'mappings', 'actions', 'singular', 'plural', 'autogen', 'generated'];

	this.autogen = definition ? definition.autogen === undefined ? true : definition.autogen : true;
	_.defaults(this, _.pick(definition, ModelFields), {
		singular: pluralize(name.toLowerCase(), 1),
		plural: pluralize(name.toLowerCase()),
		metadata: {},
		mappings: {},
		actions: VALID_ACTIONS,
		generated: false
	});

	validateActions(this.actions);

	if (!skipValidation && !definition) {
		throw new ORMError("missing required definition");
	}
	if (!skipValidation && this.fields && this.fields.id) {
		throw new ValidationError('id',"id is a reserved field name for the generated primary key");
	}

	validateFields(this.fields);

	// pull out any method definitions
	this.methods = definition && _.omit(definition, ModelFields);
	this._wireMethods();

	if (models.indexOf(this)===-1) {
		models.push(this);
		ModelClass.emit('register',this);
	}

}

const VALID_ACTIONS = ['create','upsert','read','findAll','findOne','findAndUpdate','count','query','distinct','update','delete','deleteAll'];

function validateActions(actions) {
	if (actions === undefined || actions === null) {
		return null;
	}
	if (!Array.isArray(actions)) {
		throw new ORMError("actions must be an array with one or more of the following: " + VALID_ACTIONS.join(', '));
	}
	return actions;
}

function validateFields(fields){
	if (!fields) {
		return;
	}
	Object.keys(fields).forEach(function(name){
		// should all be the same
		// type: Array
		// type: 'Array'
		// type: 'array'
		var field = fields[name];
		field.type = field.type || 'string';
		var fname = _.isObject(field.type) ? field.type.name : field.type;
		field.type = fname.toLowerCase();
		setOptionality(field);
	});
}

function setOptionality(field) {
	// since we allow both, make sure both are set
	if (field.required!==undefined) {
		field.optional = !field.required;
	}
	else {
		// defaults to optional
		field.required = false;
	}
	if (field.optional!==undefined) {
		field.required = !field.optional;
	}
	else {
		field.optional = true;
	}
}

var excludeMethods = ['getConnector','getMeta','setMeta','get','set','keys','instance','getModels','payloadKeys'];

function curryRequestDispatcher(model, fn, name, request) {
	if (request && excludeMethods.indexOf(name)===-1) {
		return function curriedRequestDispatcher() {
			var tx = request.tx && request.tx.start(
					'model:' + model.name + ':' + name,
					false,
					model.filename || 'generated',
					model.description || (model.name + ' model'));
			try {
				// if we have a callback, track the invocation and capture the
				// error and the result
				if (tx && typeof arguments[arguments.length-1] === 'function') {
					var args = Array.prototype.slice.call(arguments,0,arguments.length-1);
					var callback = arguments[arguments.length-1];
					var _tx = tx;
					tx = null; // unset so we can handle after the callback
					_tx.addArguments(args);
					args.push(function(err,result){
						if (err) { _tx.addError(err); }
						if (result) { _tx.addResult(result); }
						_tx.end();
						callback(err,result);
					});
					return fn.apply(model, args);
				}
				else {
					return fn.apply(model, arguments);
				}
			}
			finally {
				tx && tx.end();
			}
		};
	}
	else {
		return fn;
	}
}

const dispatchers = {
	'deleteAll': 'deleteAll',
	'removeAll': 'deleteAll',
	'fetch': 'query',
	'find': 'query',
	'query': 'query',
	'findAll': 'findAll',
	'findOne': 'findOne',
	'delete': 'delete',
	'remove': 'delete',
	'update': 'save',
	'save': 'save',
	'create': 'create',
	'distinct': 'distinct',
	'count': 'count',
	'findAndModify': 'findAndModify',
	'upsert': 'upsert'
};

Model.prototype._wireMethods = function _wireMethods(request) {

	// Bind functions.
	for (var name in this) {
		var fn = this[name];
		if (typeof fn === 'function') {
			if (this.connector) {
				var mapFn = dispatchers[name];
				if (mapFn) {
					var cnFn = this[mapFn];
					// we don't have a connector fn, skip it
					if (typeof cnFn !== 'function') {
						continue;
					}
				}
			}
			this[name] = curryRequestDispatcher(this, fn, name, request);
		}
		else {
			// Don't need to do anything.
		}
	}

	// Bind method functions.
	this.methods && Object.keys(this.methods).forEach(function (name) {
		var fn = this.methods[name];
		if (typeof fn === 'function') {
			this[name] = curryRequestDispatcher(this, fn, name, request);
		}
		else {
			this[name] = fn;
		}
	}.bind(this));

};

/**
 * Returns a list of available Models.
 * @returns {Array<Arrow.Model>}
 */
Model.getModels = function getModels() {
	return models;
};

/**
 * Returns a specific Model by name.
 * @param {String} name Name of the Model.
 * @returns {Arrow.Model}
 */
Model.getModel = function getModel(name) {
	for (var c=0;c<models.length;c++) {
		if (models[c].name === name) {
			return models[c];
		}
	}
};

/**
 * Binds a callback to an event.
 * @static
 * @param {String} name Event name
 * @param {Function} cb Callback function to execute.
 */
Model.on = function on(){
	ModelClass.on.apply(ModelClass, arguments);
};

/**
 * Unbinds a callback from an event.
 * @static
 * @param {String} name Event name
 * @param {Function} cb Callback function to remove.
 */
Model.removeListener = function removeListener(){
	ModelClass.removeListener.apply(ModelClass, arguments);
};

/**
 * Unbinds all event callbacks for the specified event.
 * @static
 * @param {String} [name] Event name.  If omitted, unbinds all event listeners.
 */
Model.removeAllListeners = function removeAllListeners(){
	ModelClass.removeAllListeners.apply(ModelClass, arguments);
};

// NOTE: this is internal and only used by the test and should never be called directly
Model.clearModels = function clearModels() {
	models.length = 0;
};

/**
 * Checks for a valid connector and returns it, throwing an ORMError
 * if a connector is not set.
 * @param {Boolean} dontRaiseException Set to true to not throw an error if the model is missing a connector.
 * @return {Arrow.Connector} Connector used by the Model.
 * @throws {Arrow.ORMError}
 */
Model.prototype.getConnector = function getConnector(dontRaiseException) {
	if (!this.connector && !dontRaiseException) {
		throw new ORMError("missing required connector");
	}
	return this.connector;
};

/**
 * Sets the connector for the model.
 * @param connect {Arrow.Connector}
 */
Model.prototype.setConnector = function setConnector(connector) {
	this.connector = connector;
};

Model.prototype.createRequest = function createRequest(request, response) {
	var promise = this.getConnector().createRequest(request, response);

	var model = new Model(this.name, null, true);
	_.merge(model, this);
	model.connector = promise;
	model.login = promise.login;
	model._wireMethods(request);

	return model;
};

/**
 * @method define
 * @static
 * Extends a new Model object.
 * @param {String} name Name of the new Model.
 * @param {ArrowModelDefinition} definition Model definition object.
 * @return {Arrow.Model}
 * @throws {Arrow.ValidationError} Using a reserved key name in the definition object.
 * @throws {Arrow.ORMError} Missing definition object.
 */
/**
 * @method extend
 * @alias #static-define
 */
Model.extend =
Model.define = function define(name, definition) {
	return new Model(name, definition);
};

function extendOrReduce (instance, name, definition, extend) {
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
	model.metadata = _.merge(_.cloneDeep(instance.metadata),model.metadata);
	model.mappings = _.merge(_.cloneDeep(instance.mappings),model.mappings);
	if (model.fields) {
		var fields = instance.fields;
		if (extend) {
			model.fields = mergeFields(model.fields, fields);
		}
		else {
			// allow the extending model to just specify the fields keys and pull out
			// the actual values from the extended model field (or merge them)
			Object.keys(model.fields).forEach(function(name){
				if (name in fields) {
					model.fields[name] = _.merge(_.cloneDeep(fields[name]), model.fields[name]);
				}
			});
		}
	}
	else {
		model.fields = _.cloneDeep(instance.fields);
	}
	model.connector = model.connector || instance.connector;
	model.methods = _.merge(_.cloneDeep(instance.methods),model.methods);
	model.autogen = instance.autogen;
	model.actions = (definition && definition.actions) ? definition.actions : instance.actions;
	model._supermodel = instance.name;
	model._parent = instance;
	model._wireMethods();
	return model;
}

/**
 * Creates a new Model which extends the current Model object. The fields specified in the
 * definition object will be merged with the ones defined in the current Model object.
 * @param {String} name Name of the new Model.
 * @param {ArrowModelDefinition} definition Model definition object.
 * @return {Arrow.Model}
 * @throws {Arrow.ValidationError} Using a reserved key name in the definition object.
 * @throws {Arrow.ORMError} Model is not valid or missing the definition object.
 */
Model.prototype.extend = function extend(name, definition) {
	return extendOrReduce(this, name, definition, true);
};

/**
 * Creates a new Model which reduces fields from the current Model class.
 * Only the fields specified in the definition object that are found in the current Model object
 * will be used.
 * @param {String} name Name of the new Model.
 * @param {ArrowModelDefinition} definition Model definition object.
 * @return {Arrow.Model}
 * @throws {Arrow.ValidationError} Using a reserved key name in the definition object.
 * @throws {Arrow.ORMError} Model is not valid or missing the definition object.
 */
Model.prototype.reduce = function extend(name, definition) {
	return extendOrReduce(this, name, definition, false);
};

/**
 * Creates an instance of this Model.
 * @param {Object} values Attributes to set.
 * @param {Boolean} skipNotFound Set to `true` to skip fields passed in
 * to the `value` parameter that are not defined by the Model's schema.  By default,
 * an error will be thrown if an undefined field is passed in.
 * @return {Arrow.Instance}
 * @throws {Arrow.ORMError} Model class is missing fields.
 * @throws {Arrow.ValidationError} Missing required field or field failed validation.
 */
Model.prototype.instance = function instance(values, skipNotFound) {
	return new Instance(this, values, skipNotFound);
};

function resolveOptionality(field, param) {
	setOptionality(field);
	if (field.default) {
		param.default = field.default;
	}
	param.required = field.required;
	param.optional = field.optional;
	return param;
}

/**
 * Documents the create method for API usage.
 * @return {Object}
 */
Model.prototype.createAPI = function createAPI() {
	var model = this;
	var parameters = {};
	Object.keys(model.fields).forEach(function (k) {
		var field = model.fields[k];
		parameters[k] = resolveOptionality(field, {
			description: field.description || k + ' field',
			type: 'body'
		});
	});
	return {
		generated: true,
		uiSort: 2,
		method: 'POST',
		description: this.description || 'Create a ' + this.singular,
		parameters: parameters,
		action: function createAction(req, resp, next) {
			try {
				req.model.create(req.params, next);
			}
			catch (E) {
				return next(E);
			}
		}
	};
};

/**
 * Creates a new Model or Collection object.
 * @param {Array<Object>/Object} [values] Attributes to set on the new model(s).
 * @param {Function} callback Callback passed an Error object (or null if successful), and the new model or collection.
 * @throws {Error}
 */
Model.prototype.create = function create(values, callback) {
	if(_.isFunction(values)) {
		callback = values;
		values = {};
	}
	// if we have an array of values, create all the users in one shot
	// in the case of a DB, you want to send them in batch
	if (Array.isArray(values)) {
		return this.getConnector().createMany(this, values.map(function(v){
			return this.instance(v, false).toPayload();
		}.bind(this)), callback);
	}
	try {
		// we need to create an instance to run the validator logic if any
		var instance = this.instance(values, false);
		var payload = instance.toPayload();
		var pk = this.getConnector().getPrimaryKey(this,instance) || 'id';
		if (values[pk]) {
			payload[pk] = values[pk];
		}
		this.getConnector().create(this, payload, callback);
	}
	catch (E) {
		if (E instanceof ORMError) {
			if (callback) {
				return callback(E);
			}
		}
		throw E;
	}
};

/**
 * Documents the update method for API usage.
 * @returns {Object}
 */
Model.prototype.updateAPI = function updateAPI() {
	var model = this;
	var parameters = { id: { description: 'The ' + this.singular + ' ID', type: 'path' } };
	Object.keys(model.fields).forEach(function (k) {
		var field = model.fields[k];
		parameters[k] = resolveOptionality(field,{
			description: field.description || k + ' field',
			type: 'body'
		});
	});
	return {
		generated: true,
		uiSort: 5,
		path: './:id',
		method: 'PUT',
		description: this.description || 'Update a specific ' + this.singular,
		parameters: parameters,
		action: function updateAction(req, resp, next) {
			req.model.fetch(req.params.id, resp.createCallback(next, function putSuccessCallback(model) {
				try {
					model.set(req.params);
					model.save(next);
				}
				catch (E) {
					return next(E);
				}
			}));
		}
	};
};

/**
 * @method save
 * Updates a Model instance.
 * @param {Arrow.Instance} instance Model instance to update.
 * @param {Function} callback Callback passed an Error object (or null if successful) and the updated model.
 */
/**
 * @method update
 * @alias #save
 */
Model.prototype.update =
Model.prototype.save = function save(instance, callback) {
	if (instance.isDeleted && instance.isDeleted()) {
		callback && callback(new ORMError('instance has already been deleted'));
		return;
	}
	if (!(instance instanceof Instance) || instance.isUnsaved()) {
		if (!instance instanceof Instance) {
			// we need to create an instance to run the validator logic if any
			this.instance(instance,false);
		}
		this.getConnector().save(this, instance, function saveCallback(err,result){
			if (err) { return callback && callback(err); }
			if (result) {
				result._dirty = false;
				result.emit('save');
			}
			callback && callback(null,result);
		});
	}
	// no changes, just return it
	else {
		return callback(null, instance);
	}
};

/**
 * Documents the delete method for API usage.
 * @returns {Object}
 */
Model.prototype.deleteAPI = function deleteAPI() {
	return {
		generated: true,
		uiSort: 10,
		path: './:id',
		method: 'DELETE',
		description: this.description || 'Delete a specific ' + this.singular,
		parameters: {
			id: { description: 'The ' + this.singular + ' ID', optional: false, required: true, type: 'path' }
		},
		action: function deleteAction(req, resp, next) {
			try {
				req.model.remove(req.params.id, next);
			}
			catch (E){
				return next(E);
			}
		}
	};
};

/**
 * @method remove
 * Deletes the model instance.
 * @param {Arrow.Instance} instance Model instance.
 * @param {Function} callback Callback passed an Error object (or null if successful), and the deleted model.
 */
/**
 * @method delete
 * @alias #remove
 */
Model.prototype.delete =
Model.prototype.remove = function remove(instance, callback) {
	if (typeof instance === 'object' && instance._deleted) {
		return callback && callback(new ORMError('instance has already been deleted'));
	}
	// quick validation
	if (_.isFunction(instance)){
		callback = instance;
		instance = undefined;
	}
	// array of ids means multiple delete
	if (_.isArray(instance)){
		return this.getConnector().deleteMany(this, instance, callback);
	}
	// if we specified a non-Instance, we need to findOne to get the instance
	// and then delete it
	if (typeof instance !== 'object') {
		return this.findOne(instance, function findOneCallback(err,_instance){
			if (err) { return callback(err); }
			if (!_instance) { return callback("trying to remove, couldn't find record with primary key: "+instance+" for "+this.name); }
			this.remove(_instance, callback);
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
 * Documents the delete all method for API usage.
 * @returns {Object}
 */
Model.prototype.deleteAllAPI = function deleteAllAPI() {
	return {
		generated: true,
		uiSort: 11,
		method: 'DELETE',
		description: this.description || 'Deletes all ' + this.plural,
		action: function deleteAction(req, resp, next) {
			req.model.deleteAll(resp.createCallback(next, function delAllSuccessCallback(count) {
				if (count) {
					resp.noContent(next);
				}
				else {
					resp.notFound(next);
				}
			}));
		}
	};
};

/**
 * @method removeAll
 * Deletes all the data records.
 * @param {Function} callback Callback passed an Error object (or null if successful), and the deleted models.
 */
/**
 * @method deleteAll
 * @alias #removeAll
 */
Model.prototype.deleteAll =
Model.prototype.removeAll = function removeAll(callback) {
	this.getConnector().deleteAll(this, callback);
};

/**
 * Documents the distinct method for API usage.
 * @returns {Object}
 */
Model.prototype.distinctAPI = function distinctAPI() {
	return {
		generated: true,
		uiSort: 9,
		method: 'GET',
		path: './distinct',
		actionGroup: 'read',
		description: this.description || 'Find distinct ' + this.plural,
		parameters: {
			field: {
				type: 'query',
				optional: false,
				required: true,
				description: 'The field name that must be distinct.'
			},
			where: {
				type: 'query',
				optional: true,
				required: false,
				description: 'Constrains values for fields. The value should be encoded JSON.'
			}
		},
		action: function distinctAction(req, resp, next) {
			var field = req.params.field;
			delete req.params.field;
			resp.stream(req.model.distinct, field, req.params, next);
		}
	};
};

/**
 * Finds unique values using the provided field.
 * @param {String} field The field that must be distinct.
 * @param {ArrowQueryOptions} options Query options.
 * @param {Function} callback Callback passed an Error object (or null if successful) and the distinct models.
 * @throws {Error} Failed to parse query options.
 */
Model.prototype.distinct = function distinct(field, options, callback) {
	try {
		options = prepareQueryOptions(this, options);
	}
	catch (E) {
		return callback(E);
	}
	this.getConnector().distinct(this, field, options, callback);
};

/**
 * Documents the findOne method for API usage.
 * @return {Object}
 */
Model.prototype.findOneAPI = function findOneAPI() {
	return {
		generated: true,
		uiSort: 4,
		path: './:id',
		actionGroup: 'read',
		method: 'GET',
		description: this.description || 'Find one ' + this.singular,
		parameters: {
			id: { description: 'The ' + this.singular + ' ID', optional: false, required: true, type: 'path' }
		},
		action: function findOneAction(req, resp, next) {
			try {
				resp.stream(req.model.findOne, req.params.id, next);
			}
			catch (E) {
				return next(E);
			}
		}
	};
};

/**
 * Finds a model instance using the primary key.
 * @param {String} id ID of the model to find.
 * @param {Function} callback Callback passed an Error object (or null if successful) and the found model.
 */
Model.prototype.findOne = function findOne(id, callback) {
	try {
		this.getConnector()[_.isArray(id) ? 'findOneMany' : 'findOne'](this, id, callback);
	} catch (E) {
		return callback(E);
	}
};

/**
 * Documents the query method for API usage.
 * @returns {Object}
 */
Model.prototype.findAndModifyAPI = function findAndModifyAPI() {
	var model = this;
	var parameters = {
		limit: {
			type: 'query',
			optional: true,
			required: false,
			default: 10,
			description: 'The number of records to fetch. The value must be greater than 0, and no greater than 1000.'
		},
		skip: {
			type: 'query',
			optional: true,
			required: false,
			default: 0,
			description: 'The number of records to skip. The value must not be less than 0.'
		},
		where: {
			type: 'query',
			optional: true,
			required: false,
			description: 'Constrains values for fields. The value should be encoded JSON.'
		},
		order: {
			type: 'query',
			optional: true,
			required: false,
			description: 'A dictionary of one or more fields specifying sorting of results. In general, you can sort based on any predefined field that you can query using the where operator, as well as on custom fields.'
		},
		sel: {
			type: 'query',
			optional: true,
			required: false,
			description: 'Selects which fields to return from the query. Others are excluded.'
		},
		unsel: {
			type: 'query',
			optional: true,
			required: false,
			description: 'Selects which fields to not return from the query. Others are included.'
		},
		page: { type: 'query', optional: true, required: false, default: 1, description: 'Request page number starting from 1.' },
		per_page: { type: 'query', optional: true, required: false, default: 10, description: 'Number of results per page.' }
	};
	Object.keys(model.fields).forEach(function (k) {
		var field = model.fields[k];
		parameters[k] = resolveOptionality(field,{
			description: field.description || k + ' field',
			optional: field.optional,
			required: field.required,
			type: 'body'
		});
	});
	return {
		generated: true,
		uiSort: 6,
		path: './findAndModify',
		actionGroup: 'read',
		method: 'PUT',
		description: this.description || 'Find and modify ' + this.plural,
		parameters: parameters,
		action: function queryAction(req, resp, next) {
			try {
				resp.stream(req.model.findAndModify, req.query, req.body, next);
			}
			catch (E) {
				return next(E);
			}
		}
	};
};
/**
 * Finds one model instance and modifies it.
 * @param {ArrowQueryOptions} options Query options.
 * @param {Object} doc Attributes to modify.
 * @param {Object} [args] Optional parameters.
 * @param {Boolean} [args.new=false] Set to `true` to return the new model instead of the original model.
 * @param {Boolean} [args.upsert=false] Set to `true` to allow the method to create a new model.
 * @param {Function} callback Callback passed an Error object (or null if successful) and the modified model.
 * @throws {Error} Failed to parse query options.
 */
Model.prototype.findAndModify = function findAndModify(options, doc, args, callback) {
	try {
		options = prepareQueryOptions(this, options);
		this.getConnector().findAndModify(this, options, doc, args, callback);
	}
	catch (E) {
		callback(E);
	}
};

/**
 * Documents the findAll method for API usage.
 * @returns {Object}
 */
Model.prototype.findAllAPI = function findAllAPI() {
	return {
		generated: true,
		uiSort: 1,
		description: this.description || 'Find all ' + this.plural,
		actionGroup: 'read',
		method: 'GET',
		action: function findAllAction(req, resp, next) {
			try {
				resp.stream(req.model.findAll, next);
			}
			catch (E) {
				return next(E);
			}
		}
	};
};

/**
 * Finds all model instances.  A maximum of 1000 models are returned.
 * @param {Function} callback Callback passed an Error object (or null if successful) and the models.
 */
Model.prototype.findAll = function findAll(callback) {
	try {
		if (this.getConnector().findAll) {
			return this.getConnector().findAll(this, callback);
		}
		else {
			return this.query({ limit: 1000 }, callback);
		}
	}
	catch (E) {
		callback(E);
	}
};

/**
 * Documents the count method for API usage.
 * @returns {Object}
 */
Model.prototype.countAPI = function countAPI() {
	var result = this.queryAPI();
	result.uiSort = 7;
	result.path = './count';
	result.description = this.description || 'Count ' + this.plural;
	result.action = function countAction(req, resp, next) {
		resp.stream(req.model.count, req.params, function(err,results){
			var count = 0;
			if (Array.isArray(results)) {
				count = results.length;
			}
			else if (typeof(results)==='number') {
				count = results;
			}
			return next(null, count);
		});
	};
	return result;
};

/**
 * Gets a count of records.
 * @param {ArrowQueryOptions} options Query options.
 * @param {Function} callback Callback passed an Error object (or null if successful) and the number of models found.
 */
Model.prototype.count = function count(options, callback) {
	try {
		this.getConnector().count(this, options, callback);
	}
	catch (E) {
		callback(E);
	}
};

/**
 * Documents the upsert method for API usage.
 * @returns {Object}
 */
Model.prototype.upsertAPI = function upsertAPI() {
	var result = this.createAPI();
	result.uiSort = 8;
	result.path = './upsert';
	result.actionGroup = 'create';
	result.description = this.description || 'Create or update a ' + this.singular;
	result.parameters.id = { description: 'The ' + this.singular + ' ID', type: 'body', optional: false, required: true };
	result.action = function upsertAction(req, resp, next) {
		try {
			req.model.upsert(req.params.id, req.params, next);
		}
		catch (E) {
			return next(E);
		}
	};
	return result;
};

/**
 * Updates a model or creates the model if it cannot be found.
 * @param {String} id ID of the model to update.
 * @param {Object} doc Model attributes to set.
 * @param {Function} callback Callback passed an Error object (or null if successful) and the updated or new model.
 */
Model.prototype.upsert = function upsert(id, doc, callback) {
	// we need to create an instance to run the validator logic if any
	try {
		var instance = this.instance(doc,false);
		var payload = instance.toPayload();
		var pk = this.getConnector().getPrimaryKey(this,instance) || 'id';
		if (doc[pk]) {
			payload[pk] = doc[pk];
		}
		this.getConnector().upsert(this, id, payload, callback);
	}
	catch (E) {
		callback(E);
	}
};

/**
 * Documents the query method for API usage.
 * @returns {Object}
 */
Model.prototype.queryAPI = function queryAPI() {
	return {
		generated: true,
		uiSort: 3,
		path: './query',
		method: 'GET',
		description: this.description || 'Query ' + this.plural,
		actionGroup: 'read',
		parameters: {
			limit: {
				type: 'query',
				optional: true,
				required: false,
				default: 10,
				description: 'The number of records to fetch. The value must be greater than 0, and no greater than 1000.'
			},
			skip: {
				type: 'query',
				optional: true,
				required: false,
				default: 0,
				description: 'The number of records to skip. The value must not be less than 0.'
			},
			where: {
				type: 'query',
				optional: true,
				required: false,
				description: 'Constrains values for fields. The value should be encoded JSON.'
			},
			order: {
				type: 'query',
				optional: true,
				required: false,
				description: 'A dictionary of one or more fields specifying sorting of results. In general, you can sort based on any predefined field that you can query using the where operator, as well as on custom fields.'
			},
			sel: {
				type: 'query',
				optional: true,
				required: false,
				description: 'Selects which fields to return from the query. Others are excluded.'
			},
			unsel: {
				type: 'query',
				optional: true,
				required: false,
				description: 'Selects which fields to not return from the query. Others are included.'
			},
			page: { type: 'query', optional: true, required: false, default: 1, description: 'Request page number starting from 1.' },
			per_page: { type: 'query', optional: true, required: false, default: 10, description: 'Number of results per page.' }
		},
		action: function queryAction(req, resp, next) {
			try {
				resp.stream(req.model.query, req.params, next);
			}
			catch (E) {
				return next(E);
			}
		}
	};
};

/**
 * Queries for particular model records.
 * @param {ArrowQueryOptions} options Query options.
 * @param {Function} callback Callback passed an Error object (or null if successful) and the model records.
 * @throws {Error} Failed to parse query options.
 */
Model.prototype.query = function query(options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};
	}

	try {
		options = prepareQueryOptions(this, options);
		this.getConnector().query(this, options, ((options && options.limit && options.limit===1) ? function(err,collection){
			if (err) { return callback(err); }
			// if we asked for limit 1 record on query, just return an object instead of an array
			if (collection) {
				var instance = collection && collection[0];
				return callback(null, instance);
			}
			return callback(null,collection);
		} : callback));
	}
	catch (E) {
		return callback(E);
	}

};

/**
 * @method find
 * Finds a particular model record or records.
 * @param {Object/String} [options] Key-value pairs or ID of the model to find. If omitted, performs a findAll operation.
 * @param {Function} callback Callback passed an Error object (or null if successful) and the model record(s).
 * @throws {Error} Wrong number of arguments.
 */
/**
 * @method fetch
 * @alias #find
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
				return this.query(options, callback);
			}
			return this.findOne(options, callback);
		}
		default: {
			throw new Error("wrong number of parameters passed");
		}
	}
};

/**
 * Returns model metadata.
 * @param {String} key Key to retrieve.
 * @param {Any} def Default value to return if the key is not set.
 * Does not set the value of the key.
 * @returns {Any}
 */
Model.prototype.getMeta = function getMeta(key, def) {
	var m1 = this._connector && this.metadata[this._connector];
	if (m1 && m1[key]) {
		return m1[key];
	}
	var m2 = this.getConnector() && this.metadata[this.getConnector().name];
	if (m2 && m2[key]) {
		return m2[key];
	}
	var m3 = this.metadata;
	if (m3 && m3[key]) {
		return m3[key];
	}
	return def || null;
};

/**
 * Sets metadata for the model.
 * @param {String} key Key name.
 * @param {Any} value Value to set.
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
 * Returns the field keys for the Model.
 * @returns {Array<String>}
 */
Model.prototype.keys = function keys() {
	return Object.keys(this.fields);
};

/**
 * Returns the payload keys (model field names) for the Model.
 * @return {Array<String>}
 */
Model.prototype.payloadKeys = function keys() {
	var retVal = [];
	for (var key in this.fields) {
		if (this.fields.hasOwnProperty(key) && !this.fields[key].custom) {
			retVal.push(this.fields[key].name || key);
		}
	}
	return retVal;
};

function parseBoolean(obj) {
	if (typeof(obj)==='boolean') {
		return obj;
	}
	else if (typeof(obj)==='string') {
		return /^(1|true|yes|ok)$/.test(String(obj).toLowerCase());
	}
	return obj;
}

function parseDate(obj) {
	if (obj instanceof Date) {
		return obj;
	}
	else if (typeof(obj)==='string') {
		return new Date(Date.parse(obj));
	}
	return obj;
}

function parseNumber(obj) {
	if (obj instanceof Number) {
		return obj;
	}
	else if (typeof(obj)==='string') {
		return parseInt(obj,10);
	}
	return obj;
}

/**
 * Returns an object containing keys translated from field keys to payload keys. This is useful for translating objects
 * like "where", "order", "sel" and "unsel" to their proper named underlying payload objects.
 * @param obj
 * @returns {Object}
 */
Model.prototype.translateKeysForPayload = function translateKeysForPayload(obj) {
	if (obj && _.isString(obj)) {
		try {
			obj = JSON.parse(obj);
		}
		catch (E) {
		}
	}
	if (!obj || typeof(obj)!=='object') {
		return obj;
	}
	var keys = Object.keys(obj);
	if (!keys.length) {
		return obj;
	}
	var translation = {};
	for (var fieldKey in this.fields) {
		if (this.fields.hasOwnProperty(fieldKey)) {
			var field = this.fields[fieldKey],
				srckey = field.name || fieldKey;
			translation[fieldKey] = srckey;
			switch (field.type) {
				case 'number': {
					obj[srckey] = parseNumber(obj[srckey]);
					break;
				}
				case 'boolean': {
					obj[srckey] = parseBoolean(obj[srckey]);
					break;
				}
				case 'date': {
					obj[srckey] = parseDate(obj[srckey]);
					break;
				}
				default: {
					break;
				}
			}
		}
	}
	var retVal = {};
	for (var i = 0; i < keys.length; i++) {
		var key = keys[i];
		retVal[translation[key] || key] = obj[key];
	}
	return retVal;
};

/**
 * Checks to see if the specified key in the object is a function
 * and converts it to a Function if it was converted to a string.
 * This is a helper function for the {@link #set} and {@link #get} methods.
 * @static
 * @param {Object} obj Object to check.
 * @param {String} key Key to check.
 * @returns {Function/String} If the key is not a function, returns the string, else returns the function.
 */
Model.toFunction = function(obj, key) {
	// if this is a string, return
	var fn = obj[key];
	if (fn && _.isString(fn) && /^function/.test(fn.trim())) {
		var vm = require('vm');
		var code = 'var f = (' + fn + '); f';
		fn = vm.runInThisContext(code,{
			timeout: 10000
		});
		// re-write it so we only need to remap once
		obj[key] = fn;
	}
	return fn;
};

/**
 * Processes the field value before its returned to the client.
 * This function executes the field's `get` method defined in either the Model's {@link #mappings}
 * property or the model definition object.
 * @param {String} name Field name.
 * @param {Any} value Value of the field.
 * @param {Arrow.Instance} instance Model instance.
 * @returns {Any} Value you want to return to the client.
 */
Model.prototype.get = function get(name, value, instance) {
	var mapper = this.mappings[name] || this.fields[name];
	if (mapper) {
		var fn = Model.toFunction(mapper, 'get');
		if (fn) {
			return fn(value, name, instance);
		}
	}
	return value;
};

/**
 * Processes the field value before its returned to the connector.
 * This function executes the field's `set` method defined in either the Model's {@link #mappings}
 * property or the model definition object.
 * @param {String} name Field name.
 * @param {Any} value Value of the field.
 * @param {Arrow.Instance} instance Model instance.
 * @returns {Any} Value you want to return to the connector.
 */
Model.prototype.set = function set(name, value, instance) {
	var mapper = this.mappings[name] || this.fields[name];
	if (mapper) {
		var fn = Model.toFunction(mapper, 'set');
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

function translateCSVToObject(str) {
	var retVal = {},
		split = str.split(',');
	for (var i = 0; i < split.length; i++) {
		retVal[split[i].trim()] = 1;
	}
	return retVal;
}

/*
 * Merges the fields, taking in to consideration renamed fields.
 * @param definedFields
 * @param inheritedFields
 * @returns {*}
 */
function mergeFields(definedFields, inheritedFields) {
	var retVal = _.merge({}, inheritedFields, definedFields);
	for (var key in definedFields) {
		if (definedFields.hasOwnProperty(key)) {
			var definedField = definedFields[key];
			if (definedField.name && definedField.name !== key && inheritedFields[definedField.name]) {
				delete retVal[definedField.name];
			}
		}
	}
	return retVal;
}

/*
 * Looks through a query "where" for $like and $notLike values that can be translated to $regex strings.
 * @param where
 */
function translateQueryRegex(where) {
	for (var key in where) {
		if (where.hasOwnProperty(key)) {
			var val = where[key];
			if (key === '$like' || key === '$notLike') {
				var regex = '^' + val
						.replace(/%{2}/g, '\\%')
						.replace(/(^|[^\\])%/g, '$1.*')
						.replace(/(^|[^\\])_/g, '$1.') + '$';
				if (key === '$like') {
					where.$regex = regex;
					delete where.$like;
				}
				else {
					where.$not = { $regex: regex };
					delete where.$notLike;
				}
			}
			else if (_.isArray(val)) {
				for (var i = 0; i < val.length; i++) {
					if (_.isObject(val[i])) {
						translateQueryRegex(val[i]);
					}
				}
			}
			else if (_.isObject(val)) {
				translateQueryRegex(val);
			}
		}
	}
}


function prepareQueryOptions(ctx, options) {
	// Look for JSON for us to parse.
	parseProperties(options);

	var validOptions = { where: 1, sel: 1, unsel: 1, page: 1, per_page: 1, order: 1, skip: 1, limit: 1 };

	// Allow mixed casing on the parameters.
	for (var casedKey in options) {
		if (options.hasOwnProperty(casedKey)) {
			if (!validOptions[casedKey] && validOptions[casedKey.toLowerCase()]) {
				options[casedKey.toLowerCase()] = options[casedKey];
				delete options[casedKey];
			}
		}
	}

	// Did they just pass in some fields and their values? Wrap it before passing to query.
	if (!_.any(validOptions, function (val, key) {
			return options[key] !== undefined;
		})) {
		options = { where: options };
	}

	// Translate sel and unsel, if specified.
	if (options.sel !== undefined && typeof options.sel === 'string') {
		options.sel = translateCSVToObject(options.sel);
	}
	if (options.unsel !== undefined && typeof options.unsel === 'string') {
		options.unsel = translateCSVToObject(options.unsel);
	}

	if (ctx.defaultQueryOptions) {
		options = _.merge(ctx.defaultQueryOptions, options);
	}

	// Ensure limit and per_page are set.
	options.limit = options.per_page = +options.limit || +options.per_page || 10;

	// Ensure page and skip are set.
	if (options.page === undefined && options.skip !== undefined) {
		options.skip = +options.skip;
		options.page = Math.floor(options.skip / options.limit) + 1;
	}
	else if (options.skip === undefined && options.page !== undefined) {
		options.page = +options.page;
		options.skip = (options.page - 1) * options.per_page;
	}
	else {
		options.page = 1;
		options.skip = 0;
	}

	if (ctx.getConnector().translateWhereRegex && options.where !== undefined) {
		translateQueryRegex(options.where);
	}
	
	return options;
}