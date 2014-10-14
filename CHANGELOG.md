# 1.0.17 (2014-10-14)

- [#13](https://github.com/appcelerator/api-orm/pull/13) Fixed method binding for some specific Connector methods
- [#15](https://github.com/appcelerator/api-orm/issues/15) Fixed Collection to only accept a Model instance
- [#94](https://github.com/appcelerator/api/issues/94) Added actions property to Model to allow you to specify the CRUD actions that the model supports. One of 'create', 'read', 'update', 'delete'.  Defaults to all.
- [#95](https://github.com/appcelerator/api/issues/95) Added support for Connector queries
- [#98](https://github.com/appcelerator/api/issues/98) Added autogen property to Model to indicate if the model supports auto generation of APIs.  Defaults to true

# 1.0.16 (2014-09-20)

### Model

- Fixed error in `extend` method that wasn't properly merging model fields
- Added field level mapping support for `serialize` and `deserialize`
- Added field level renaming using `name` field for both serialization and deserialization
- Support model functions


# 1.0.15 (2014-09-20)

### Model

- Added method `getModel` to get a model by name

### Connector

- Added prototype method `getPrimaryKey` that will allow the Connector to provide returning a primary key value for a Model and specific data value.  By default, the default implementation will return the value of the `id` property.  However, Connectors must either override this method or set the `idAttribute` property if the primary key is different than `id`.  Connectors that have the same primary key name across all Models can use the `idAttribute`.  For Connectors where the primary key is different dependant on the Model, the `getPrimaryKey` method should be provided.

### Model Linking

To link a field to a Model, you can specify the `model` attribute with the name of the model.  Model fields can only be linked to field types `Object` or `Array`.

Example usage:

```javascript
var Person = orm.Model.define('person',{
	fields: {
		name: {
			type: String
		},
		age: {
			type: Number
		}
	}
});
var Contact = orm.Model.define('contact',{
	fields: {
		person: {
			type: Object,
			model: 'person'
		}
	}
});
```

# 1.0.14 (2014-09-20)

### Collection

- Added support for indexed lookup for Collections (collection[1])
- Added support for passing in a single Model to Collection
- Added method `toArray` to return array copy for Collection internal models
- Added method `get` that will return single model at index


### Instance

- Added support for tracking unsaved fields
- Added method `getChangedFields` which will return unchanged fields and values (as object)
- `values` method will now exclude fields marked as `readonly`
- `values` method takes an optional boolean argument to indicate whether only unsaved fields should be returned.  Defaults to false.
- Added support for `readonly` field validation. Will raise a `ValidationException` if you attempt to set a readonly field.
- Added support for custom serialization
- Added support for built-in type coersion (Number -> Date)
- Added support for field level mappings


### Model

- Added support for `readonly` field property
- Added support for custom serialization
- Added support for field level mappings

### Field Mapping

You can now perform field level mapping to control serialization and deserialization of the field.

To add a field level map, specify such as:

```javascript
var Customer = APIBuilder.createModel('customer',{
	fields: {
		field: {type: String},
		email: {type: String}
	},
	mappings: {
		field: {
			serialize: function(value) {
				var tokens = value.split('/');
				return {
					a: tokens[0],
					b: tokens[1]
				};
			},
			deserialize: function(value) {
				return value.a + '/' + value.b;
			}
		}
	}
});
```

In the above example, the field named `field` would call the `serialize` function before the object was sent to the client.

To deserialize, the function `deserialize` would be called before the object is sent to the connector.
