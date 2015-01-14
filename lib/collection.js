'use strict';

var _ = require('lodash'),
	EventEmitter = require('events').EventEmitter,
	error = require('./error'),
	Instance = require('./instance');

module.exports = Collection;

/**
 * Creates an array and extends it with event emitter and custom functionality.
 * @class
 * @classdesc Collection for holding model instance objects.
 * @constructor
 */
function Collection(model, instances) {
	// shift args
	if (!instances && Array.isArray(model)) {
		instances = model;
		model = null;
	}

	// create a new array instance
	var arr = [];

	// set the model
	arr.model = model;

	// if we have some model instances, add them to the array
	if (instances) {
		// check that the instances is an array and each element is an Instance object
		if (!Array.isArray(instances) || instances.some(function (instance) { return !(instance instanceof Instance); })) {
			throw new error.ORMError('Collection only takes an array of model instance objects');
		}

		arr.push.apply(arr, instances);
	}

	// mixin the EventEmitter
	_.merge(arr, EventEmitter.prototype);
	EventEmitter.init.call(arr);

	/**
	 * Adds an instance to the collection.
	 * @param {Instance} Instance - The model instance to add.
	 */
	arr.add = function add(instance) {
		if (!(instance instanceof Instance)) {
			throw new error.ORMError('Invalid model instance object');
		}
		this.push(instance);
	};

	/**
	 * Returns the instance at the specified index. If the index is out-of-bounds, it returns undefined.
	 * @param {Number} idx - The index in the collection to retrieve.
	 */
	arr.get = function get(idx) {
		return this[idx];
	};

	/**
	 * Returns a JSON version of the collection.
	 * @returns {Array} - The collection.
	 */
	arr.toJSON = function toJSON() {
		return this;
	};

	/**
	 * Returns a copy of the collection as a vanilla array.
	 * @returns {Array} - A copy of the collection.
	 */
	arr.toArray = function toArray() {
		return [].concat(this);
	};

	// return our array object
	return arr;
}
