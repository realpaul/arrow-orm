var util = require('util'),
	events = require('events'),
	_ = require('lodash'),
	Instance = require('./instance'),
	error = require('./error'),
	ORMError = error.ORMError,
	ConnectorPromise = require('./promise'),
	connectors = [],
	ConnectorClass = new events.EventEmitter();

util.inherits(Connector, events.EventEmitter);

module.exports = Connector;

function Connector(impl, config) {
	impl && _.merge(this,impl);
	this.config = _.merge(config || {}, impl && impl.config || {});

	// if we provided a constructor in our impl, use it
	if (this.constructor && this.constructor!==Connector && !this.constructor.super_) {
		this.constructor.call(this);
		Connector.constructor.call(this);
	}

	if (connectors.indexOf(this)===-1) {
		connectors.push(this);
		ConnectorClass.emit('register',this);
	}
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

Connector.prototype.create = function create(Model, values, callback) {
	callback(new ORMError("not implemented"));
};

Connector.prototype.save = function save(Model, instance, callback) {
	callback(new ORMError("not implemented"));
};

Connector.prototype.delete = function remove(Model, instance, callback) {
	callback(new ORMError("not implemented"));
};

Connector.prototype.deleteAll = function deleteAll(Model, instance, callback) {
	callback(new ORMError("not implemented"));
};

Connector.prototype.find = function find(Model, properties, callback) {
	callback(new ORMError("not implemented"));
};

Connector.prototype.findAll = function findAll(Model, callback) {
	callback(new ORMError("not implemented"));
};

Connector.prototype.findOne = function findOne(Model, id, callback) {
	callback(new ORMError("not implemented"));
};
