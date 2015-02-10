var util = require('util'),
	_ = require('lodash'),
	events = require('events'),
	Mingo = require('mingo'),
	Model = require('../model'),
	Instance = require('../instance'),
	Collection = require('../collection'),
	Connector = require('../connector');

module.exports = MemoryConnector;
util.inherits(MemoryConnector, Connector);

var PK = 0;

Mingo.setup({
	key: 'id'
});

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
	var table = this.getTable(Model.name);
	for (var c=0;c<table.length;c++) {
		var entry = table[c];
		if (entry.getPrimaryKey() === instance.getPrimaryKey()) {
			entry.set(instance.toJSON(),true);
			break;
		}
	}
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
	var cursor = Mingo.find(this.getTable(Model.name),options.where),
		sort = options.sort,
		skip = options.skip,
		limit = options.limit;

	if (sort) {
		cursor.sort(sort);
	}
	if (skip) {
		cursor.skip(skip);
	}
	if (limit) {
		cursor.limit(limit);
	}

	var records = cursor.all();

	// filter out fields
	if (options.sel || options.unsel) {
		var sel = options.sel && Object.keys(options.sel),
			unsel = options.unsel && Object.keys(options.unsel);
		records = records.map(function(record) {
			var id = record.getPrimaryKey();
			if (sel && sel.length) {
				record = _.pick(record,sel);
			}
			if (unsel && unsel.length) {
				record = _.omit(record, unsel);
			}
			var instance = Model.instance(record,true);
			instance.setPrimaryKey(id);
			return instance;
		});
	}

	callback(null, new Collection(Model,records));
};

MemoryConnector.prototype.distinct = function distinct(Model, field, options, callback) {
	this.query(Model, options, function(err, results){
		if(err){
			callback(err);
		} else {
			var values = results.map(function(element){
				return element[field];
			});
			callback(null, values.filter(function(element, index){
				return values.indexOf(element) === index;
			}));
		}
	});
};

MemoryConnector.prototype.findAll = function findAll(Model, callback) {
	callback(null, new Collection(Model,this.getTable(Model.name)));
};

MemoryConnector.prototype.findOne = function findOne(Model, id, callback) {
	var found = iterator(this.getTable(Model.name), id);
	callback(null, found && found[0]);
};

MemoryConnector.prototype.findAndModify = function findAndModify(Model, options, doc, args, callback) {
	if(typeof args === "function"){
		callback = args;
		args = {};
	}
	this.query(Model, (options.limit = 1, options), function(err, result){
		if(err){
			return callback(err);
		}
		if(result && result.length){
			result[0].set(doc, false);
			this.save(Model, result[0], function(err, record){
				callback(err, args.new ? record : result[0]);
			});
		} else if(args.upsert){
			this.create(Model, doc, function(err, record){
				callback(err, args.new ? record : {});
			});
		} else {
			callback(null, undefined);
		}
	}.bind(this));
};

/**
 * return the column that is the primary key internally (not in the model, but in the native data source)
 * this is used by the model when translating the query for selecting/unselecting columns
 */
MemoryConnector.prototype.getPrimaryKeyColumnName = function(Model) {
	return 'id';
};
