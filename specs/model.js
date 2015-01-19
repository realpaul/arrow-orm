var should = require('should'),
	async = require('async'),
	util = require('util'),
	_  = require('lodash'),
	orm = require('../');

describe('models',function(){

	before(function(){
		orm.Model.clearModels();
		orm.Model.removeAllListeners();
	});

	afterEach(function(){
		orm.Model.clearModels();
		orm.Model.removeAllListeners();
	});

	it('should be able to register and retrieve models',function(){
		var Connector = new orm.MemoryConnector();

		var found;

		orm.Model.on('register',function(c){
			found = c;
		});

		should(orm.Model.getModels()).be.an.array;
		should(orm.Model.getModels()).have.length(0);

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					default: 'Jeff'
				}
			},
			connector: Connector
		});

		should(orm.Model.getModels()).have.length(1);
		should(orm.Model.getModels()[0]).equal(User);
	});

	it('should be able to get model keys',function(){
		var Connector = new orm.MemoryConnector();
		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					default: 'Jeff'
				},
				age: {
					type: Number,
					default: 10
				}
			},
			connector: Connector
		});

		should(User.keys()).be.an.array;
		should(User.keys()).eql(['name','age']);
	});

	it('should be able to get instance values',function(callback){
		var Connector = new orm.MemoryConnector();
		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					default: 'Jeff'
				},
				age: {
					type: Number,
					default: 10
				}
			},
			connector: Connector
		});

		User.create(function(err,instance){
			should(err).be.not.ok;
			should(instance).be.an.object;
			should(instance.keys()).be.an.array;
			should(instance.keys()).eql(['name','age']);
			should(instance.values()).eql({name:'Jeff',age:10});
			callback();
		});

	});

	it('should be able to get payloads for servers',function(callback){
		var Connector = new orm.MemoryConnector();
		var User = orm.Model.define('user',{
			fields: {
				name: {
					name: 'internalName',
					type: String,
					default: 'Jeff'
				},
				age: {
					type: Number,
					default: 10
				},
				yearOfBirth: {
					type: Number,
					custom: true,
					default: (new Date().getFullYear() - 10)
				}
			},
			connector: Connector
		});

		var payloadKeys = User.payloadKeys(),
			modelKeys = User.keys();
		should(payloadKeys).containEql('internalName');
		should(payloadKeys).containEql('age');
		should(payloadKeys).not.containEql('yearOfBirth');
		should(modelKeys).containEql('name');
		should(modelKeys).containEql('age');
		should(modelKeys).containEql('yearOfBirth');

		User.create(function(err,instance){
			should(err).be.not.ok;
			should(instance).be.an.Object;
			var payload = instance.toPayload();
			should(payload).be.an.Object;
			should(payload.name).be.not.ok;
			should(payload.internalName).be.ok;
			should(payload.age).be.ok;
			should(payload.yearOfBirth).be.not.ok;
			callback();
		});

	});

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

	it("should support fields of type Array", function(){
		var Connector = new orm.MemoryConnector();
		var Preowned = orm.Model.define("preowned", {
			fields: {
				model: { type: String },
				aircraftStatus: { type: String },
				cabinEntertainment: { type: Array }
			},
			connector: Connector,
			autogen: false
		});
		var data = {
			model:'Rick',
			aircraftStatus: 'in-flight',
			cabinEntertainment:
				[
					{
						"feature": "DVD player (multi-region) / 15” LCD flat panel swing-out monitor"
					},
					{
						"feature": "Rosen View LX moving map program / Six Rosen 6.5” LCD monitors"
					},
					{
						"feature": "XM satellite radio / Eight 115v outlets"
					}
				]
		};
		var preowned = Preowned.instance(data,true);
		preowned.get('model').should.equal('Rick');
		preowned.get('aircraftStatus').should.equal('in-flight');
		preowned.get('cabinEntertainment').should.equal(data.cabinEntertainment);
		preowned.get('cabinEntertainment').should.have.length(3);
		preowned.get('cabinEntertainment')[0].should.have.property('feature',"DVD player (multi-region) / 15” LCD flat panel swing-out monitor");
		preowned.get('cabinEntertainment')[1].should.have.property('feature',"Rosen View LX moving map program / Six Rosen 6.5” LCD monitors");
		preowned.get('cabinEntertainment')[2].should.have.property('feature',"XM satellite radio / Eight 115v outlets");
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
				should(err).be.not.ok;
				should(user).be.an.object;
				should(user.name).be.equal('jeff');
				should(user.getPrimaryKey()).be.ok;
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
				should(result[0]).be.an.Object;
				should(result[0].name).be.equal('jeff');
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
				should(result[0]).be.an.Object;
				should(result[0].name).be.equal('jeff');
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
				should(result[0].name).be.equal('jeff');
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
			should(JSON.stringify(user)).be.equal(JSON.stringify({id:user.getPrimaryKey(),name:'Jeff'}));
			callback();
		});

	});

	it('should be able to create model without connector',function(){
		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				}
			}
		});
		// should not throw exception
	});

	it('should be able to extend models',function(){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('User',{
			fields: {
				name: {
					type: String,
					required: false
				}
			},
			connector: Connector
		});

		var AgeModel = User.extend('AgeUser',{
			fields: {
				age: {
					type: Number
				}
			}
		});

		should(AgeModel).be.an.Object;
		should(AgeModel.connector).be.an.Object;
		should(AgeModel.connector).be.equal(Connector);
		should(AgeModel.fields.name).be.ok;
		should(AgeModel.fields.age).be.ok;

		// test extending an extended model from another model

		var BirthdayAgeModel = AgeModel.extend(orm.Model.define('BirthdayAgeUser', {
			fields: {
				birthdate: {
					type: Date
				}
			},
			connector: Connector
		}));
		should(BirthdayAgeModel).be.an.Object;
		should(BirthdayAgeModel.fields).have.property('name');
		should(BirthdayAgeModel.fields).have.property('age');
		should(BirthdayAgeModel.fields).have.property('birthdate');

		var BirthdayModel = User.extend(orm.Model.define('BirthdayUser', {
			fields: {
				birthdate: {
					type: Date
				}
			},
			connector: Connector
		}));
		should(BirthdayModel).be.an.Object;
		should(BirthdayModel.fields).have.property('name');
		should(BirthdayModel.fields).not.have.property('age');
		should(BirthdayModel.fields).have.property('birthdate');

		(function(){
			BirthdayAgeModel.extend();
		}).should.throw('invalid argument passed to extend. Must either be a model class or model definition');

	});

	it('should be able to reduce models',function(){

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

		var ExtendedUser = User.reduce('ExtendedUser',{
			fields: {
				age: {
					type: Number
				}
			}
		});

		should(ExtendedUser).be.an.object;
		should(ExtendedUser.connector).be.an.object;
		should(ExtendedUser.connector).be.equal(Connector);
		should(ExtendedUser.fields.name).not.be.ok;
		should(ExtendedUser.fields.age).be.ok;

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

			var id = collection[0].getPrimaryKey();
			var json = JSON.stringify(collection[0]);
			var _user = _.merge({id:id},users[0]);
			should(json).be.equal(JSON.stringify(_user));

			json = JSON.stringify(collection[0]);
			_user = _.merge({id:id},users[0]);
			should(json).be.equal(JSON.stringify(_user));

			var inspect = util.inspect(collection[0]);
			should(inspect).be.equal(util.inspect(_user));

			inspect = util.inspect(collection[0]);
			should(inspect).be.equal(util.inspect(_user));

			var result = _.sortBy(collection, 'age')[0];

			should(result).be.an.object;
			should(result.name).be.equal('Jenna');

			result = _.sortBy(collection, '-age')[0];

			should(result).be.an.object;
			should(result.name).be.equal('Jeff');

			result = _.max(collection, 'age');
			should(result).be.an.object;
			should(result.name).be.equal('Jeff');

			result = _.min(collection, 'age');
			should(result).be.an.object;
			should(result.name).be.equal('Jenna');

			result = _.where(collection, {'age':12})[0];
			should(result).be.an.object;
			should(result.name).be.equal('Jack');

			result = _.find(collection, function(value){
				return value.age > 12 && value.age < 18;
			});

			should(result).be.an.object;
			should(result.name).be.equal('Jared');

			collection.length = 0;
			should(collection.length).be.equal(0);

			callback();
		});

	});

	it('should raise exception if no connector set on model and you use it',function(){

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
			// once you attempt to use it, should raise if not set
			User.find({});
		}).should.throw('missing required connector');

	});

	it('should be able to change model',function(){

		var connector = new orm.MemoryConnector();
		var connector2 = new orm.MemoryConnector();

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
			connector: connector
		});

		should(User.getConnector()).equal(connector);
		User.setConnector(connector2);
		should(User.getConnector()).equal(connector2);
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

	it('should not error on setting id',function(callback){

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

			// should not error
			user.id = 123;

			callback();
		});

	});

	it('should skip not found on instance create',function(){

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

		var model;

		(function(){
			model = User.instance({foo:'bar'},true);
		}).should.not.throw;

		should(model).be.an.object;
		should(model).not.have.property('foo');

	});

	it('should be able to set a custom model function', function(callback){
		var Connector = new orm.MemoryConnector();

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
				return this.name.charAt(0).toUpperCase() + this.name.substring(1);
			},

			getMyConnector: function() {
				return this.getConnector();
			}
		});

		User.create(function(err,user){
			should(err).not.be.ok;
			should(user).be.an.object;
			should(user.getProperName()).be.equal('Jeff');
			should(user.getMyConnector()).be.equal(Connector);
			callback();
		});

	});

	it('should not return readonly fields in values',function(){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				},
				email: {
					type: String,
					readonly: true
				}
			},
			connector: Connector
		});

		var model = User.instance({name:'bar'},true);
		var values = model.values();
		should(values).be.an.object;
		should(values).have.property('name','bar');
		should(values).not.have.property('email');
	});

	it('should not return toArray from collection',function(){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				},
				email: {
					type: String,
					readonly: true
				}
			},
			connector: Connector
		});

		var model = User.instance({name:'bar'},true);
		var collection = new orm.Collection(User, [model]);
		var array = collection.toArray();
		should(array).be.an.array;
		should(array).have.length(1);
		should(array[0]).be.equal(model);
	});

	it('should be able to pass single value to Collection',function(){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				},
				email: {
					type: String,
					readonly: true
				}
			},
			connector: Connector
		});

		var model = User.instance({name:'bar'},true);
		var collection = new orm.Collection(User, model);
		should(collection[0]).be.equal(model);
		should(collection.get(0)).be.equal(model);
	});

	it('should be able to set dirty fields and retrieve them',function(){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				},
				email: {
					type: String
				}
			},
			connector: Connector
		});

		var model = User.instance({name:'bar',email:'jeff@foo.com'},true);
		model.set('name','foo');
		should(model.isUnsaved()).be.true;
		model.getChangedFields().should.have.property('name','foo');
		model.getChangedFields().should.not.have.property('email');
	});

	it('should not be able to set readonly fields',function(){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				},
				email: {
					type: String,
					readonly: true
				}
			},
			connector: Connector
		});

		var model = User.instance({name:'bar',email:'jeff@foo.com'},true);
		(function(){
			model.set('email','foo@bar.com');
		}).should.throw('cannot set read-only field: email');
	});

	it('should be able to coerce numbers',function(){
		var User = orm.Model.define('user', {
			fields: { age: { type: Number } },
			connector: 'memory'
		});
		var instance = User.instance({ age: 10 });
		should(instance.get('age')).be.equal(10);
		instance = User.instance({ age: '10' });
		should(instance.get('age')).be.equal(10);
	});

	it('should be able to coerce booleans',function(){
		var User = orm.Model.define('user', {
			fields: { fancy: { type: Boolean } },
			connector: 'memory'
		});

		// True coercion.
		var instance = User.instance({ fancy: true });
		should(instance.get('fancy')).be.equal(true);
		instance = User.instance({ fancy: 'true' });
		should(instance.get('fancy')).be.equal(true);
		instance = User.instance({ fancy: '1' });
		should(instance.get('fancy')).be.equal(true);
		instance = User.instance({ fancy: 1 });
		should(instance.get('fancy')).be.equal(true);

		// False coercion.
		instance = User.instance({ fancy: false });
		should(instance.get('fancy')).be.equal(false);
		instance = User.instance({ fancy: 'false' });
		should(instance.get('fancy')).be.equal(false);
		instance = User.instance({ fancy: '0' });
		should(instance.get('fancy')).be.equal(false);
		instance = User.instance({ fancy: 0 });
		should(instance.get('fancy')).be.equal(false);

		// Defaults to null when not provided or required.
		instance = User.instance({});
		should(instance.get('fancy')).be.equal(null);
	});

	it('should be able to get model from instance',function(){

		var Connector = new orm.MemoryConnector();

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					required: false
				},
				email: {
					type: String,
					readonly: true
				}
			},
			connector: Connector
		});

		var instance = User.instance({name:'bar',email:'jeff@foo.com'},true);
		should(instance.getModel()).be.equal(User);
	});

	describe("#mapping", function(){

		it("should pass field name to getter", function(){
			var Connector = new orm.MemoryConnector();

			var _name;

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String
					}
				},
				mappings: {
					name: {
						get: function(value, name) {
							_name = name;
						}
					}
				},
				connector: Connector
			});

			var model = User.instance({name:'foo/bar'},true);
			var obj = model.toJSON();
			should(_name).be.equal('name');
		});

		it("should pass instance to getter", function() {
			var Connector = new orm.MemoryConnector();

			var _instance,
				_customInstance;

			var User = orm.Model.define('user', {
				fields: {
					name: {
						type: String
					},
					bar: {
						type: String
					},
					qux: {
						type: String,
						custom: true,
						get: function(value, name, instance) {
							_customInstance = instance;
						}
					}
				},
				mappings: {
					name: {
						get: function(value, name, instance) {
							_instance = instance;
						}
					}
				},
				connector: Connector
			});

			var model = User.instance({ name: 'foo/bar', bar: 'foo' }, true);
			var obj = model.toJSON();
			should(_instance).be.ok;
			should(_customInstance).be.ok;
			should(_instance).equal(_customInstance);
			should(_instance).be.an.Object;
			should(_instance.get('bar')).be.equal('foo');
		});

		it("should be able to serialize", function(){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String
					}
				},
				mappings: {
					name: {
						get: function(value) {
							var tokens = value.split('/');
							return {
								a: tokens[0],
								b: tokens[1]
							};
						},
						set: function(value) {
							return value.a + '/' + value.b;
						}
					}
				},
				connector: Connector
			});

			var model = User.instance({name:'foo/bar'},true);
			var obj = model.toJSON();
			should(obj).be.an.object;
			should(obj).have.property('name');
			should(obj.name).have.property('a','foo');
			should(obj.name).have.property('b','bar');

		});

		it("should be able to define a getter for a field", function(){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						get: function(value) {
							var tokens = value.split('/');
							return {
								a: tokens[0],
								b: tokens[1]
							};
						},
						set: function(value) {
							return value.a + '/' + value.b;
						}
					}
				},
				connector: Connector
			});

			var model = User.instance({name:'foo/bar'},true);
			var obj = model.toJSON();
			should(obj).be.an.object;
			should(obj).have.property('name');
			should(obj.name).have.property('a','foo');
			should(obj.name).have.property('b','bar');
		});

		it("should be able to use a setter", function(){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String
					}
				},
				mappings: {
					name: {
						get: function(value) {
							var tokens = value.split('/');
							return {
								a: tokens[0],
								b: tokens[1]
							};
						},
						set: function(value) {
							return value.a + '/' + value.b;
						}
					}
				},
				connector: Connector
			});

			var model = User.instance({name:'foo/bar'},true);
			model.set("name", {a:"bar",b:"foo"});
			var obj = model.get("name");
			should(obj).be.equal("bar/foo");
			var changed = model.getChangedFields();
			should(changed).have.property('name','bar/foo');
		});

		it("should be able to deserialize in field", function(){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						get: function(value) {
							var tokens = value.split('/');
							return {
								a: tokens[0],
								b: tokens[1]
							};
						},
						set: function(value) {
							return value.a + '/' + value.b;
						}
					}
				},
				connector: Connector
			});

			var model = User.instance({name:'foo/bar'},true);
			model.set("name", {a:"bar",b:"foo"});
			var obj = model.get("name");
			should(obj).be.equal("bar/foo");
			var changed = model.getChangedFields();
			should(changed).have.property('name','bar/foo');
		});

	});

	describe('#connector', function(){

		it('should be able to add to collection', function(){
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
			var instance = User.instance({name:"jeff"});
			var collection = new orm.Collection(User,[instance]);
			should(collection).be.an.object;
			should(collection.length).be.equal(1);
			collection.add(User.instance({name:"nolan"}));
			should(collection.length).be.equal(2);
			collection.add([
				User.instance({name:"rick"}),
				User.instance({name:"tony"})
			]);
			should(collection.length).be.equal(4);
		});
	});

	describe('#mapping', function(){
		it('should support field renaming on serialization',function(callback){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false,
						name: 'thename'
					}
				},
				connector: Connector
			});

			User.create({name:'Jeff'}, function(err,user){
				should(err).not.be.ok;
				var serialized = JSON.stringify(user);
				should(serialized).equal(JSON.stringify({ id: user.getPrimaryKey(), name: 'Jeff' }));
				var serializedPayload = JSON.stringify(user.toPayload());
				should(serializedPayload).equal(JSON.stringify({ thename: 'Jeff' }));
				var serializedWhere = JSON.stringify(User.translateKeysForPayload({ name: 1, id: 1, foo: 'bar' }));
				should(serializedWhere).equal(JSON.stringify({ thename: 1, id: 1, foo: 'bar' }));
				callback();
			});

		});
		it('should support field renaming on deserialization',function(){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false,
						name: 'thename'
					}
				},
				connector: Connector
			});

			var user = User.instance({thename:'Jeff'});
			var serialized = JSON.stringify(user);
			should(serialized).equal(JSON.stringify({name:'Jeff'}));
		});
	});

	describe('#serialization',function(){

		it('should serialize all fields',function(callback){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false
					},
					age: {
						type: Number,
						required: false
					}
				},
				connector: Connector
			});

			User.create({name:'Jeff'}, function(err,user){
				should(err).not.be.ok;
				var serialized = JSON.stringify(user);
				should(serialized).equal(JSON.stringify({id:user.getPrimaryKey(),name:'Jeff',age:null}));
				callback();
			});
		});

	});

	describe('#metadata', function(){

		it('should be able to fetch no metadata', function(){
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

			should(User.getMeta('foo')).be.null;
		});

		it('should be able to fetch default', function(){
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

			should(User.getMeta('foo','bar')).be.equal('bar');
		});

		it('should be able to fetch from Model', function(){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false
					}
				},
				connector: Connector,
				metadata: {
					memory: {
						foo: 'bar'
					}
				}
			});

			should(User.getMeta('foo')).be.equal('bar');
		});

		it('should be able to set on Model', function(){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false
					}
				},
				connector: Connector,
				metadata: {
					memory: {
						foo: 'bar'
					}
				}
			});

			User.setMeta('foo','bar2');

			should(User.getMeta('foo')).be.equal('bar2');
		});

	});

	describe("#autogen", function(){

		it('should be able have default autogen to true', function(){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false
					}
				},
				connector: Connector,
				metadata: {
					memory: {
						foo: 'bar'
					}
				}
			});

			User.autogen.should.be.true;
		});

		it('should be able to set autogen to true', function(){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false
					}
				},
				connector: Connector,
				metadata: {
					memory: {
						foo: 'bar'
					}
				},
				autogen: true
			});

			User.autogen.should.be.true;
		});

		it('should be able to set autogen to false', function(){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false
					}
				},
				connector: Connector,
				metadata: {
					memory: {
						foo: 'bar'
					}
				},
				autogen: false
			});

			User.autogen.should.be.false;
		});

	});

	describe("#actions", function(){

		it('should be able have default actions', function(){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false
					}
				},
				connector: Connector,
				metadata: {
					memory: {
						foo: 'bar'
					}
				}
			});

			User.actions.should.eql(['create','read','update','delete','deleteAll']);
		});

		it('should be able set one action', function(){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false
					}
				},
				connector: Connector,
				metadata: {
					memory: {
						foo: 'bar'
					}
				},
				actions: ['create']
			});

			User.actions.should.eql(['create']);
		});

		it('should require an array of actions', function(){
			var Connector = new orm.MemoryConnector();


			(function(){
			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false
					}
				},
				connector: Connector,
				metadata: {
					memory: {
						foo: 'bar'
					}
				},
				actions: 'create'
			});
			}).should.throw('actions must be an array with one or more of the following: create, read, update, delete, deleteAll');
		});

		it('should require a specific type of action', function(){
			var Connector = new orm.MemoryConnector();


			(function(){
				var User = orm.Model.define('user',{
					fields: {
						name: {
							type: String,
							required: false
						}
					},
					connector: Connector,
					metadata: {
						memory: {
							foo: 'bar'
						}
					},
					actions: ['foo']
				});
			}).should.throw('invalid action `foo` must be an array with one or more of the following: create, read, update, delete, deleteAll');
		});

	});

	describe("#collection", function(){

		it("should not be able to send non-Model to collection", function(){
			var Connector = new orm.MemoryConnector();

			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false
					}
				},
				connector: Connector,
				metadata: {
					memory: {
						foo: 'bar'
					}
				},
				actions: ['create']
			});

			(function(){
				var collection = new orm.Collection(User, [{name:"Jeff"}]);
			}).should.throw('Collection only takes an array of Model instance objects');
		});

	});

	describe("#operations" ,function() {

		it("should define model function based on connector", function(){
			var Connector = new orm.MemoryConnector();
			Connector.deleteAll = null;
			var User = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false
					}
				},
				connector: Connector,
				metadata: {
					memory: {
						foo: 'bar'
					}
				}
			});
			should(User.deleteAll).be.Undefined;
			should(User.removeAll).be.Function;

			Connector.create = null;
			var User2 = orm.Model.define('user',{
				fields: {
					name: {
						type: String,
						required: false
					}
				},
				connector: Connector,
				metadata: {
					memory: {
						foo: 'bar'
					}
				}
			});
			should(User2.create).be.Undefined;
		});

	});

});