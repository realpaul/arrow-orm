var util = require('util'),
	_ = require('lodash'),
	events = require('events'),
	Model = require('../model'),
	Instance = require('../instance'),
	Collection = require('../collection'),
	Connector = require('../connector');

module.exports = MemoryConnector;
util.inherits(MemoryConnector, Connector);

function MemoryConnector(config) {
	Connector.apply(this,arguments);
	this.DB = [];
	this.PK = 0;
	this.config = config;
}

MemoryConnector.prototype.create = function create(Model, values, callback) {
	var instance = Model.instance(values);
	instance.setPrimaryKey(++this.PK);
	this.DB.push(instance);
	callback && callback(null, instance);
};

MemoryConnector.prototype.save = function save(Model, instance, callback) {
	callback && callback(null, instance);
};

function iterator(DB, instance, fn) {
	if (typeof instance === 'function') {
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
	var found = iterator(this.DB, instance, function iterate(index, object){
		this.DB.splice(index,1);
		return true;
	}.bind(this));
	callback && callback(null, found[0]);
};

MemoryConnector.prototype.deleteAll = function deleteAll(Model, callback) {
	var count = this.DB.length;
	this.DB = [];
	callback && callback(null, count);
};

MemoryConnector.prototype.find = function find(Model, properties, callback) {
	var keys = _.keys(properties),
		found = iterator(this.DB, function iterate(index, object){
			var found = 0;
			for (var c=0;c<keys.length;c++) {
				var key = keys[c];
				if (key in object && object[key] === properties[key]) {
					found++;
					break;
				}
			}
			return found === keys.length;
		});
	callback(null, new Collection(Model,found));
};

MemoryConnector.prototype.findAll = function findAll(Model, callback) {
	callback(null, new Collection(Model,this.DB));
};

MemoryConnector.prototype.findOne = function findOne(Model, id, callback) {
	var found = iterator(this.DB, id);
	callback(null, found && found[0]);
};
