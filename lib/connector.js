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
		Object.keys(methods).forEach(function(method){
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
	return function(config) {
		return new Connector(impl, config);
	};
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
Connector.prototype.isConnected = function() {
	return this.connected;
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
	if (this.fetchConfig) {
		tasks.push(function fetchConfigTask(next){
			this.fetchConfig(function fetchConfigTaskCallback(err,config){
				if (err) { return next(err); }
				// basically, the construtors config should override
				// our default config from the connector
				this.config = _.merge(config,this.config);
				next();
			}.bind(this));
		}.bind(this));
	}
	if (this._connect) {
		tasks.push(function connectTask(next){
			this._connect(next);
		}.bind(this));
	}
	if (this.fetchSchema) {
		tasks.push(function fetchSchemaTask(next){
			this.fetchSchema(function fetchSchemaTaskCallback(err,schema){
				if (err) { return next(err); }
				if (schema) {
					// hold it temporarily
					this._schema = _.merge(this.schema||{}, schema);
				}
				next();
			}.bind(this));
		}.bind(this));
	}
	if (this.fetchMetadata) {
		tasks.push(function fetchMetadataTask(next){
			this.fetchMetadata(function fetchMetadataTaskCallback(err,metadata){
				if (err) { return next(err); }
				if (metadata) {
					this.metadata = _.merge(this.metadata||{}, metadata);
					this.metadata.schema = this._schema;
				}
				else {
					this.metadata = _.merge(this.metadata||{}, {schema: this._schema});
				}
				delete this._schema;
				next();
			}.bind(this));
		}.bind(this));
	}
	else {
		// no metadata, let's just make one with schema
		tasks.push(function metadataTask(next){
			if (!this.metadata || !this.metadata.schema){
				this.metadata = _.merge(this.metadata||{}, {schema: this._schema});
				delete this._schema;
			}
			next();
		}.bind(this));
	}
	async.series(tasks, function(err){
		if (err) { return callback(err); }
		this.connected = true;
		callback();
	}.bind(this));
};
