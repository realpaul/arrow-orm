var util = require('util'),
	events = require('events'),
	_ = require('lodash'),
	async = require('async'),
	Instance = require('./instance'),
	error = require('./error'),
	ORMError = error.ORMError,
	ConnectorPromise = require('./promise'),
	connectors = [],
	ConnectorClass = new events.EventEmitter();

util.inherits(Connector, events.EventEmitter);

module.exports = Connector;

function Connector(impl, config) {
	impl && _.merge(this,_.omit(impl,'connect'));
	// setup our methods to delegate through...
	var methods = impl && _.pick(impl,'create','save','update','findOne','findAll','find','query','delete','deleteAll');
	if (methods) {
		Object.keys(methods).forEach(function connectorMethodIterator(method){
			var fn = methods[method];
			if (typeof fn === 'function') {
				// if a function, delegate through our wrapper
				wrapDelegate(this, method, fn);
			}
			else {
				// just assign
				this[method] = fn;
			}
		}.bind(this));
	}

	// pull in these into the connector if we don't have them but we have them in our
	// package
	['description','version','name','author'].forEach(function(k){
		if (!this[k] && this.pkginfo && (k in this.pkginfo)) {
			this[k] = this.pkginfo[k];
		}
	}.bind(this));


	// re-map connect for lifecycle
	this._connect = impl && impl.connect;
	this.connected = false;

	// incoming constructor config should overwrite implementation
	this.config = _.merge(impl && impl.config || {}, config);

	// if we provided a constructor in our impl, use it
	if (this.constructor && this.constructor!==Connector && !this.constructor.super_) {
		this.constructor.call(this);
		Connector.constructor.call(this);
	}

	if (!this.name) {
		throw new ORMError('connector is required to have a name');
	}

	if (connectors.indexOf(this)===-1) {
		connectors.push(this);
		ConnectorClass.emit('register',this);
	}
}

function wrapDelegate(connector, method, delegate) {
	connector[method] = function methodWrapper(){
		// check if we're connected and if so, go ahead and delegate
		if (connector.connected) {
			return delegate.apply(connector,arguments);
		}
		// we're not connected, call through to connect before continuing
		else {
			var callback = arguments[arguments.length - 1],
				args = arguments;
			connector.connect(function(err){
				if (err) { return callback && callback(err); }
				delegate.apply(connector,args);
			});
		}
	};
}

Connector.getConnectors = function getConnectors() {
	return connectors;
};

Connector.on = function on(){
	ConnectorClass.on.apply(ConnectorClass, arguments);
};

Connector.removeListener = function removeListener(){
	ConnectorClass.removeListener.apply(ConnectorClass, arguments);
};

Connector.removeAllListeners = function removeAllListeners(){
	ConnectorClass.removeAllListeners.apply(ConnectorClass, arguments);
};

// NOTE: this is internal and only used by the test and should never be called directly
Connector.clearConnectors = function clearConnectors() {
	connectors.length = 0;
};

/**
 * called to create a wrapper around this instance which will enforce login, etc.
 */
Connector.prototype.createRequest = function createRequest(request) {
	return new ConnectorPromise(request, this);
};

/**
 * create a new Class using impl as the template
 */
Connector.extend = function classExtend(impl) {
	function ConnectorConstructor(config) {
		return new Connector(impl, config);
	}

	ConnectorConstructor.extend = function(extendingImpl) {
		return classExtend(_.merge(impl, extendingImpl));
	};

	return ConnectorConstructor;
};

/**
 * create a new class extending from this instance's Class
 */
Connector.prototype.extend = function instanceExtend(impl) {
	return Connector.extend(_.merge(this,impl));
};

/**
 * returns true if connected
 */
Connector.prototype.isConnected = function isConnected() {
	return this.connected;
};

/**
 * returns primary key. defaults to id. connectors must override to provide
 * a different value
 */
Connector.prototype.getPrimaryKey = function getPrimaryKey(Model, record) {
	return record[this.idAttribute||'id'];
};

/**
 * connect lifecycle which will call the following (if provided by implementation):
 *
 * 1. fetchConfig
 * 2. connect
 * 3. fetchSchema
 * 4. fetchMetadata
 */
Connector.prototype.connect = function(callback) {
	if (this.connected) {
		return callback();
	}
	var tasks = [];
	if (this.fetchMetadata) {
		tasks.push(function fetchMetadataTask(next) {
			this.fetchMetadata(function fetchMetadataTaskCallback(err, metadata) {
				if (err) { return next(err); }
				if (metadata) {
					this.metadata = _.merge(this.metadata || {}, metadata);
				}
				next();
			}.bind(this));
		}.bind(this));
	}
	else {
		// no metadata, let's just make an empty one
		tasks.push(function metadataTask(next) {
			if (!this.metadata) {
				this.metadata = { schema: undefined };
			}
			next();
		}.bind(this));
	}
	if (this.fetchConfig) {
		tasks.push(function fetchConfigTask(next) {
			this.fetchConfig(function fetchConfigTaskCallback(err, config) {
				if (err) { return next(err); }
				// basically, the constructors config should override
				// our default config from the connector
				this.config = _.merge(config, this.config);
				var possibleErr = this.validateConfig();
				if (possibleErr !== true) {
					next(possibleErr);
				}
				else {
					next();
				}
			}.bind(this));
		}.bind(this));
	}
	else {
		tasks.push(function configTask(next) {
			if (!this.config) {
				this.config = {};
			}
			var possibleErr = this.validateConfig();
			if (possibleErr !== true) {
				next(possibleErr);
			}
			else {
				next();
			}
		}.bind(this));
	}
	if (this._connect) {
		tasks.push(function connectTask(next) {
			this._connect(next);
		}.bind(this));
	}
	if (this.fetchSchema) {
		tasks.push(function fetchSchemaTask(next) {
			this.fetchSchema(function fetchSchemaTaskCallback(err, schema) {
				if (err) { return next(err); }
				if (schema) {
					this.metadata = _.merge(this.metadata || {}, { schema: schema });
				}
				next();
			}.bind(this));
		}.bind(this));
	}
	async.series(tasks, function connectCallback(err) {
		if (err) { return callback(err); }
		this.connected = true;
		callback();
	}.bind(this));
};

/**
 * Validates whether or not the config for this connector is valid, based on its metadata.
 * @returns {boolean} True if the config is valid, otherwise an Error.
 */
Connector.prototype.validateConfig = function validateConfig() {
	var metadata = this.metadata,
		config = this.config || {};

	if (!metadata || !metadata.fields || !metadata.fields.length) {
		return true;
	}

	for (var i = 0; i < metadata.fields.length; i++) {
		var field = metadata.fields[i];
		if (!config[field.name]) {
			if (field.required) {
				return new Error(field.name + ' is a required config property for the ' + this.name + ' connector!');
			}
			if (field.default !== undefined) {
				config[field.name] = field.default;
			}
		}
		else if (field.validator && !field.validator.test(config[field.name])) {
			return new Error('The value "' + config[field.name] + '" for ' + field.name + ' is invalid for the ' + this.name + ' connector!');
		}
	}

	return true;
};