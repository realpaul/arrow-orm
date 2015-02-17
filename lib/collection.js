'use strict';

var _ = require('lodash'),
	EventEmitter = require('events').EventEmitter,
	error = require('./error'),
	Instance = require('./instance');

module.exports = Collection;

var getPrototypeOf = Object.getPrototypeOf || function(o){
	return o.__proto__;
};
var setPrototypeOf = Object.setPrototypeOf || function(o, p){
	o.__proto__ = p;
	return o;
};

/**
 * Creates an array of instances
 * @class
 * @classdesc Collection for holding model instance objects.
 * @constructor
 */
function Collection(model, instances) {
	if (!instances && Array.isArray(model)) {
		instances = model;
		model = null;
	}
	var array = [];
	var isNew = this instanceof Collection;
	var proto = isNew ? getPrototypeOf(this) : Collection.prototype;
	var self = setPrototypeOf(array, proto);
	Object.defineProperty(self,'model',{
		value: model,
		enumerable: false
	});
	instances && self.add(instances);
	return self;
}

Collection.prototype = Object.create(Array.prototype, { constructor: { value: Collection } });

/**
 * Returns a copy of the collection as a vanilla array.
 * @returns {Array} - A copy of the collection.
 */
Collection.prototype.toArray = function() {
	return [].concat(this);
};

/**
 * Returns the instance at the specified index. If the index is out-of-bounds, it returns undefined.
 * @param {Number} idx - The index in the collection to retrieve.
 */
Collection.prototype.get = function(index) {
	return this[index];
};

/**
 * Adds an instance to the collection.
 * @param {Instance} Instances - The model instance to add.
 */
Collection.prototype.push =
Collection.prototype.add = function(instances) {
	Array.isArray(instances) || (instances = [instances]);

	for (var c=0;c<instances.length;c++){
		var instance = instances[c];
		// check that the instances is an array and each element is an Instance object
		if (!(instance instanceof Instance)) {
			throw new error.ORMError('Collection only takes an array of Model instance objects');
		}
		Array.prototype.push.call(this,instance);
	}

	return this;
};

function objectCustomizer(obj) {
	if (obj instanceof Instance) {
		return obj.toJSON();
	}
	else if (Array.isArray(obj)) {
		var array = [];
		// NOTE: don't just use map since it could be a collection object
		obj.forEach(function(o){
			array.push(_.cloneDeep(o, objectCustomizer));
		});
		return array;
	}
	else if (obj.toJSON) {
		return obj.toJSON();
	}
	else if (_.isFunction(obj)) {
		return undefined;
	}
	else if (_.isObject(obj)) {
		return _.cloneDeep(obj, objectCustomizer);
	}
	return obj;
}

/**
 * Returns a JSON version of the collection.
 * @returns {Array} - The collection.
 */
Collection.prototype.toJSON = function toJSON() {
	return _.cloneDeep(this, objectCustomizer);
};

["concat", "reverse", "slice", "splice", "sort", "filter", "map"].forEach(function(name) {
	var _Array_func = this[name];
	Collection.prototype[name] = function() {
		var result = _Array_func.apply(this, arguments);
		return setPrototypeOf(result, getPrototypeOf(this));
	};
}, Array.prototype);
