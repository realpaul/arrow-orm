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


