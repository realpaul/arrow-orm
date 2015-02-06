var util = require('util'),
	_ = require('lodash'),
	events = require('events'),
	Model = require('../model'),
	Instance = require('../instance'),
	Collection = require('../collection'),
	Connector = require('../connector');

module.exports = MemoryConnector;
util.inherits(MemoryConnector, Connector);

var PK = 0;

function MemoryConnector(config) {
	this.name = 'memory';
	this.DB = {};
	this.config = config;
	Connector.apply(this,arguments);
}

MemoryConnector.prototype.getTable = function(name) {
	var array = this.DB[name];
	if (!array) {
		array = [];
		this.DB[name] = array;
	}
	return array;
};

MemoryConnector.prototype.create = function create(Model, values, callback) {
	var instance = Model.instance(values);
	instance.setPrimaryKey(++PK);
	this.getTable(Model.name).push(instance);
	callback && callback(null, instance);
};

MemoryConnector.prototype.save = function save(Model, instance, callback) {
	callback && callback(null, instance);
};

function iterator(DB, instance, fn) {
	if (_.isFunction(instance)) {
		fn = instance;
		instance = null;
	}
	var results = [],
		pk = instance && ((typeof(instance)==='object' && instance instanceof Instance) ? instance.getPrimaryKey() : instance),
		pkStr = String(pk);
	for (var c=0;c<DB.length;c++) {
		var object = DB[c];
		if (!pk || String(object.getPrimaryKey())===pkStr) {
			if (fn) {
				if (fn(c,object)) {
					results.push(object);
				}
			}
			else {
				results.push(object);
			}
			if (pk) {
				// if we have a primary key, then bail after we find one
				break;
			}
		}
	}
	return results;
}

MemoryConnector.prototype.delete = function remove(Model, instance, callback) {
	var table = this.getTable(Model.name),
		keys = [],
		found = iterator(table, instance, function iterate(index, object){
			if (instance.getPrimaryKey() === object.getPrimaryKey()) {
				keys.push(index);
				return true;
			}
		}.bind(this));
	keys.forEach(function(index){
		table.splice(index,1);
	});
	callback && callback(null, found && found[0]);
};

MemoryConnector.prototype.deleteAll = function deleteAll(Model, callback) {
	var table = this.getTable(Model.name),
		count = table.length;
	this.DB[Model.name] = [];
	callback && callback(null, count);
};

MemoryConnector.prototype.query = function find(Model, options, callback) {
	var properties = options.where,
		keys = _.keys(properties),
		found = iterator(this.getTable(Model.name), function iterate(index, object){
			var found = 0;
			for (var c=0;c<keys.length;c++) {
				var key = keys[c];
				if (key in object && object[key] === properties[key]) {
					found++;
				}
			}
			return found === keys.length;
		});
	callback(null, new Collection(Model,found));
};

MemoryConnector.prototype.findAll = function findAll(Model, callback) {
	callback(null, new Collection(Model,this.getTable(Model.name)));
};

MemoryConnector.prototype.findOne = function findOne(Model, id, callback) {
	var found = iterator(this.getTable(Model.name), id);
	callback(null, found && found[0]);
};
