var should = require('should'),
	async = require('async'),
	util = require('util'),
	orm = require('../');

describe('models',function(){

	it('should be able to create with defaults',function(callback){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					default: 'Jeff'
				}
			},
			connector: Connector
		});

		User.create(function(err,user){
			should(err).not.be.ok;
			should(user).be.an.object;
			should(user.name).be.equal('Jeff');
			callback();
		});

	});

	it('should be able to validate field with regular expression',function(callback){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				age: {
					type: Number,
					validator: /^[0-9]$/
				}
			},
			connector: Connector
		});

		User.create({age:9},function(err,user){
			should(err).not.be.ok;
			should(user).be.an.object;
			should(user.age).be.equal(9);

			(function(){
				user.age = 12;
			}).should.throw('field "age" failed validation using expression "/^[0-9]$/" and value: 12');

			callback();
		});

	});

	it('should be able to validate field with function',function(callback){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				age: {
					type: Number,
					validator: function(value) {
						if (value !== 9) {
							return 'Number must be 9';
						}
					}
				}
			},
			connector: Connector
		});

		User.create({age:9},function(err,user){
			should(err).not.be.ok;
			should(user).be.an.object;
			should(user.age).be.equal(9);

			(function(){
				user.age = 12;
			}).should.throw('Number must be 9');

			callback();
		});

	});

	it('should raise exception if missing required field',function(callback){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: true
				}
			},
			connector: Connector
		});

		User.create(function(err,user){
			should(err).be.ok;
			should(user).not.be.an.object;
			should(err.message).be.equal('required field value missing: name');

			User.create({name:'Jeff'}, function(err,user){
				should(err).not.be.ok;
				should(user).be.an.object;
				should(user.name).be.equal('Jeff');
				callback();
			});

		});

	});

	it('should not raise exception if not required field',function(callback){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				}
			},
			connector: Connector
		});

		User.create(function(err,user){
			should(err).not.be.ok;
			should(user).be.an.object;
			should(user.name).be.Undefined;
			callback();
		});

	});

	it('should be able to set field value',function(callback){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				}
			},
			connector: Connector
		});

		User.create(function(err,user){
			should(err).not.be.ok;
			should(user).be.an.object;
			should(user.name).be.Undefined;
			user.set('name','jeff');
			should(user.name).be.equal('jeff');
			user.name = 'jack';
			should(user.name).be.equal('jack');
			should(user.get('name')).be.equal('jack');
			callback();
		});

	});

	it('should be able to set field value and listen for event',function(callback){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				}
			},
			connector: Connector
		});

		User.create(function(err,user){
			should(err).not.be.ok;
			should(user).be.an.object;
			should(user.name).be.Undefined;
			user.on('change:name',function(value,old_value){
				should(value).be.equal('jeff');
				should(old_value).be.Undefined;
				user.removeAllListeners();
				callback();
			});
			user.set('name','jeff');
			should(user.name).be.equal('jeff');
		});

	});

	it('should be able to CRUD',function(callback){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: true
				},
				age: {
					type: Number,
					default: 10
				}
			},
			connector: Connector
		});

		var tasks = [],
			user;

		tasks.push(function(next){
			User.create({name:'jeff'},function(err,u){
				user = u;
				should(err).not.be.ok;
				should(user).be.an.object;
				should(user.name).be.equal('jeff');
				should(user.getPrimaryKey()).be.equal(1);
				next();
			});
		});

		tasks.push(function(next){
			user.set('name','jeff2');
			should(user.name).be.equal('jeff2');
			should(user.isUnsaved()).be.true;
			user.name = 'jeff';
			next();
		});

		tasks.push(function(next){
			user.set('name','jeff2');
			user.removeAllListeners();
			var saved = false;
			user.on('save',function(){
				saved = true;
				user.removeAllListeners();
			});
			User.save(user, function(err,result){
				should(err).not.be.ok;
				should(result).be.an.object;
				should(user.isUnsaved()).be.false;
				should(saved).be.true;
				next();
			});
		});

		tasks.push(function(next){
			User.deleteAll(function(err,result){
				should(err).not.be.ok;
				should(result).be.a.Number;
				should(result > 0).be.true;
				next();
			});
		});

		tasks.push(function(next){
			User.create({name:'jeff'},function(err,result){
				should(err).not.be.ok;
				should(result).be.an.object;
				user = result;
				next();
			});
		});

		tasks.push(function(next){
			User.findAll(function(err,result){
				should(err).not.be.ok;
				should(result).be.an.Object;
				should(result).have.length(1);
				should(result.at(0)).be.an.Object;
				should(result.at(0).value()).be.an.Object;
				should(result.first()).be.an.Object;
				should(result.first().name).be.equal('jeff');
				next();
			});
		});

		tasks.push(function(next){
			User.findOne(user.getPrimaryKey(),function(err,result){
				should(err).not.be.ok;
				should(result).be.an.Object;
				should(result.name).be.equal('jeff');
				next();
			});
		});

		tasks.push(function(next){
			User.find({name:'jeff'},function(err,result){
				should(err).not.be.ok;
				should(result).be.an.Object;
				should(result).have.length(1);
				should(result.at(0)).be.an.Object;
				should(result.first()).be.an.Object;
				should(result.first().name).be.equal('jeff');
				next();
			});
		});

		tasks.push(function(next){
			User.find({name:'jeff2'},function(err,result){
				should(err).not.be.ok;
				should(result).be.an.Object;
				should(result).have.length(0);
				next();
			});
		});

		tasks.push(function(next){
			User.find({age:10},function(err,result){
				should(err).not.be.ok;
				should(result).be.an.Object;
				should(result).have.length(1);
				should(result.first().name).be.equal('jeff');
				next();
			});
		});

		tasks.push(function(next){
			User.remove(user, function(err,result){
				should(err).not.be.ok;
				should(result).be.an.object;
				should(result.name).be.equal('jeff');
				should(result.isDeleted()).be.true;
				next();
			});
		});

		tasks.push(function(next){
			User.findOne(user, function(err,result){
				should(err).not.be.ok;
				should(result).not.be.ok;
				next();
			});
		});

		async.series(tasks,callback);
	});

	it('should be able to serialize to JSON',function(callback){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				}
			},
			connector: Connector
		});

		User.create({name:'Jeff'},function(err,user){
			should(err).not.be.ok;
			should(user).be.an.object;
			// serialized model instances should only serialize their values
			should(JSON.stringify(user)).be.equal(JSON.stringify({name:'Jeff'}));
			callback();
		});

	});

	it('should be able to extend models',function(){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				}
			},
			connector: Connector
		});

		var ExtendedUser = User.extend('ExtendedUser',{
			fields: {
				age: {
					type: Number
				}
			}
		});

		should(ExtendedUser).be.an.object;
		should(ExtendedUser.connector).be.an.object;
		should(ExtendedUser.connector).be.equal(Connector);
		should(ExtendedUser.fields.name).be.ok;
		should(ExtendedUser.fields.age).be.ok;

		var AnotherModel = orm.Model.define('another',{
			fields: {
				birthdate: {
					type: Date
				}
			},
			connector: Connector
		});

		// test extending an extended model from another model

		var NewModel = ExtendedUser.extend(AnotherModel);

		should(NewModel).be.an.object;
		should(NewModel.fields).have.property('name');
		should(NewModel.fields).have.property('age');
		should(NewModel.fields).have.property('birthdate');

		(function(){
			NewModel.extend();
		}).should.throw('invalid argument passed to extend. Must either be a model class or model definition');

	});

	it('should be able to use chain operators',function(callback){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				},
				age: {
					type: Number,
					required: true
				}
			},
			connector: Connector
		});

		var users = [
			{name: 'Jeff', age: 43},
			{name: 'Jared', age: 14},
			{name: 'Jack', age: 12},
			{name: 'Jenna', age: 10}
		];

		User.create(users, function(err,collection){
			should(err).be.not.ok;

			should(collection).be.an.object;
			should(collection.length).be.equal(4);

			var json = JSON.stringify(collection.first());
			should(json).be.equal(JSON.stringify(users[0]));

			json = JSON.stringify(collection.at(0));
			should(json).be.equal(JSON.stringify([users[0]]));

			var inspect = util.inspect(collection.first());
			should(inspect).be.equal(util.inspect(users[0]));

			inspect = util.inspect(collection.at(0));
			should(inspect).be.equal(util.inspect([users[0]]));

			var result = collection.sortBy('age').first();

			should(result).be.an.object;
			should(result.name).be.equal('Jenna');

			result = collection.sortBy('-age').first();

			should(result).be.an.object;
			should(result.name).be.equal('Jeff');

			result = collection.max('age').value();
			should(result).be.an.object;
			should(result.name).be.equal('Jeff');

			result = collection.min('age').value();
			should(result).be.an.object;
			should(result.name).be.equal('Jenna');

			result = collection.where({'age':12}).first();
			should(result).be.an.object;
			should(result.name).be.equal('Jack');

			result = collection.find(function(value){
				return value.age > 12 && value.age < 18;
			});

			should(result).be.an.object;
			should(result.name).be.equal('Jared');

			collection.length = 0;
			should(collection.length).be.equal(0);

			callback();
		});

	});

	it('should raise exception if no connector set on model',function(){

		(function(){
			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false
					},
					age: {
						type: Number,
						required: true
					}
				}
			});
		}).should.throw('missing required connector');

	});

	it('should error if already deleted',function(callback){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				}
			},
			connector: Connector
		});

		User.create({name:'Jeff'},function(err,user){
			should(err).not.be.ok;
			should(user).be.an.object;

			user.delete(function(err,result){
				should(err).not.be.ok;
				should(user).be.equal(result);

				user.save(function(err){
					should(err).be.ok;
					should(err.message).be.equal('instance has already been deleted');
					callback();
				});
			});

		});

	});

	it('should not error if already saved',function(callback){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				}
			},
			connector: Connector
		});

		User.create({name:'Jeff'},function(err,user){
			should(err).not.be.ok;
			should(user).be.an.object;

			user.save(function(err,result){
				should(err).not.be.ok;
				should(result).not.be.ok;
				callback();
			});

		});

	});

});