# API Builder ORM [![Build Status](https://magnum.travis-ci.com/appcelerator/api-orm.svg?token=xjwxUDk3aUJaLhguTqyB&branch=master)](https://magnum.travis-ci.com/appcelerator/api-orm)

Object relational mapping (ORM) framework for [API Builder](https://github.com/appcelerator/api).

## Changelog

Please see the [CHANGELOG](https://github.com/appcelerator/api-orm/blob/master/CHANGELOG.md) for the latest changes.


## Main Components

There are 4 main components to the ORM framework:

- *Model* - the model that represents data
- *Instance* - an instance of a Model object
- *Collection* - a collection of zero or more Instances
- *Connector* - a connector which is responsible for managing Models

### Model

To define a model, you must give a set of fields and a connector.

```javascript
var User = orm.Model.define('user',{
	fields: {
		name: {
			type: String,
			default: 'Jeff',
		}
	},
	connector: Connector
});
```

The first argument is the name of the model. The second argument is the definition of the model.

The following are Model field properties:

| Name        | Description                                                   |
|-------------|---------------------------------------------------------------|
| type        | the column type (such as String, Number, etc)                 |
| required    | if true, the field is required                                |


The model has several instance methods:

| Name          | Description                                                      |
|---------------|------------------------------------------------------------------|
| extend        | create a new Model class from the current Model                  |
| create        | create a new Model instance                                      |
| update        | update a Model instance                                          |
| remove        | remove a Model instance                                          |
| removeAll     | remove all Model instances                                       |
| find          | find one or more Models                                          |
| findOne       | find one Model from a primary key                                |
| findAll       | find all Model                                                   |

A model can have custom functions by defining them in the definition as a property.  They will automatically be available on the model instance.

```javascript
var User = orm.Model.define('user',{
	fields: {
		name: {
			type: String,
			required: true,
			default: 'jeff'
		}
	},
	connector: Connector,

	// implement a function that will be on the Model and
	// available to all instances
	getProperName: function() {
		// this points to the instance when this is invoked
		return this.name.charAt(0).toUpperCase() + this.name.substring(1);
	}
});

User.create(function(err,user){
	console.log(user.getProperName());
});
```

### Instance

One you've defined a model, you can then use it to create an Instance of the Model.

```javascript
User.create({name:'Nolan'}, function(err,user){
	// you now have a user instance
});
```

Instances has several methods for dealing with the model.

| Name          | Description                                                      |
|---------------|------------------------------------------------------------------|
| get           | get the value of a field property                                |
| set           | set a value or a set of values (Object)                          |
| isUnsaved     | returns true if the instance has pending changes                 |
| isDeleted     | returns true if the instance has been deleted and cannot be used |
| update        | save any pending changes                                         |
| remove        | remove this instance (delete it)                                 |
| getPrimaryKey | return the primary key value set by the Connector                |

In addition to `get` and `set`, you can also use property accessors to get field values.

```javascript
console.log('name is',user.name);
user.name = 'Rick';
```

### Collection

If the Connector returns more than one Model instance, it will return it as a Collection, which is a container of Model instances.

A collection acts like an array but has additional helper functions for manipulating the collection.

You can get the length of the collection with the `length` property.

The collection extends the Lodash instance and provides access to all the [Collection methods](http://lodash.com/docs#_) such as `at`, `min`, `max`, `value`, `sortBy`, etc.

For example, do search for all models which have the `age` field with the value `12`, you could write:

```javascript
var result = collection.where({'age':12}).first();
```

### Connector

To create a connector, you can either inherit from the `Connector` class using `utils.inherit` or extend:

```javascript
var MyConnector = orm.Connector.extend({
	constructor: function(){
	},
	findOne: function(Model, id, callback) {
	}
});
```

Once you have created a Connector class, you can create a new instance:

```javascript
var connector = new MyConnector({
	url: 'http://foobar.com'
});
```

