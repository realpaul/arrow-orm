var should = require('should'),
	async = require('async'),
	util = require('util'),
	orm = require('../');

describe('connectors',function(){

	before(function(){
		orm.Connector.clearConnectors();
		orm.Connector.removeAllListeners();
	});

	afterEach(function(){
		orm.Connector.clearConnectors();
		orm.Connector.removeAllListeners();
	});

	it('should require a name',function(){
		(function(){
			var MyConnector = orm.Connector.extend({});
			var connector = new MyConnector();
		}).should.throw('connector is required to have a name');
	});

	it('should be able to register and retrieve connectors',function(){
		var MyConnector = orm.Connector.extend({name:'MyConnector'});

		should(orm.Connector.getConnectors()).be.an.array;
		should(orm.Connector.getConnectors()).have.length(0);

		var found;

		orm.Connector.on('register',function(c){
			found = c;
		});

		var connector = new MyConnector();

		should(found).be.ok;
		should(found).equal(connector);

		should(orm.Connector.getConnectors()).have.length(1);
		should(orm.Connector.getConnectors()[0]).equal(connector);
	});

	it('should be able to create with defaults',function(){

		var MyConnector = orm.Connector.extend({name:'MyConnector'});
		should(MyConnector).be.an.object;

		var connector = new MyConnector();

		should(connector).be.an.object;
	});

	it('should be able to create with config',function(){

		var MyConnector = orm.Connector.extend({name:'MyConnector'});

		should(MyConnector).be.an.object;
		var connector = new MyConnector({
			hello: 'world'
		});

		should(connector).be.an.object;
		should(connector.config).be.an.object;
		should(connector.config).have.property('hello','world');
	});

	it('should be able to create with constructor',function(){

		var ctor = false;

		var MyConnector = orm.Connector.extend({
			name: 'MyConnector',
			constructor: function(){
				ctor = true;
			}
		});

		should(MyConnector).be.an.object;
		var connector = new MyConnector();

		should(connector).be.an.object;
		should(ctor).be.true;

	});

	it('should be able to create by extending another instance',function(){

		var MyConnector = orm.Connector.extend({name:'MyConnector'});

		should(MyConnector).be.an.object;
		var connector = new MyConnector();

		var AnotherConnector = connector.extend({
			hello: function(){}
		});

		should(AnotherConnector).be.an.object;
		should(AnotherConnector.hello).be.a.function;

		var instance = new AnotherConnector();
		should(instance).be.an.object;
		should(instance.hello).be.a.function;

	});

	it('should be able to create promise',function(callback){

		var connection,
			start = false,
			end = false;

		var MyConnector = orm.Connector.extend({
			name: 'MyConnector',
			startRequest: function(name, args, request, next){
				start = true;
				next();
			},
			endRequest: function (name, args, request, next){
				end = true;
				next();
			},
			loginRequired: function(request, next) {
				next(null, !!!connection);
			},
			login: function(request, response, next) {
				connection = {
					username: request.params.email
				};
				next();
			},
			findOne: function(Model, id, next){
				connection.foo = 'bar';
				var instance = Model.instance({});
				next(null, instance);
			}
		});

		var connector = new MyConnector();

		var request = {
			session: {},
			params: {
				email: 'foo@bar.com'
			}
		};

		var response = {};

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					default: 'Jeff',
				}
			},
			connector: connector
		});

		var UserPromise = User.createRequest(request, response);

		should(UserPromise).be.an.object;
		should(UserPromise.connector).be.an.object;
		should(UserPromise.connector).not.be.equal(connector);
		should(UserPromise.login).should.be.a.function;

		UserPromise.findOne(1, function(err,user){
			should(err).not.be.ok;
			should(user).be.ok;
			should(user).have.property('name','Jeff');
			// login should have been called and we set
			should(connection).be.an.object;
			should(connection).have.property('username','foo@bar.com');
			should(start).be.true;
			should(end).be.true;

			connection.username = 'bar@foo.com'; // set it to test that it doesn't change
			UserPromise.findOne(2, function(err,user){
				should(err).not.be.ok;
				should(user).be.ok;
				should(connection).be.an.object;
				// this means it didn't go back through login if still set
				should(connection).have.property('username','bar@foo.com');
				callback();
			});
		});

	});

	it('should translate query page, per_page, skip and limit', function() {
		var shouldBe;
		var MyConnector = orm.Connector.extend({
			name: 'testing',
			query: function(Model, options, callback) {
				should(options).eql(shouldBe);
				callback(null, {});
			}
		});
		var connector = new MyConnector();
		var model = orm.Model.define('user',{
			connector: connector
		});

		function noop() { }

		shouldBe = { where: {}, per_page: 10, limit: 10, page: 1, skip: 0 };
		model.query({}, noop);

		// Limit and per_page should be interchangeable.
		shouldBe = { per_page: 1, limit: 1, page: 1, skip: 0 };
		model.query({ per_page: 1 }, noop);
		shouldBe = { per_page: 2, limit: 2, page: 1, skip: 0 };
		model.query({ limit: 2 }, noop);

		// Page should translate to skip properly.
		shouldBe = { per_page: 3, limit: 3, page: 3, skip: 6 };
		model.query({ per_page: 3, page: 3 }, noop);
		shouldBe = { per_page: 4, limit: 4, page: 4, skip: 12 };
		model.query({ skip: 12, limit: 4 }, noop);

	});

	it('should translate sel and unsel', function() {
		var shouldBe;
		var MyConnector = orm.Connector.extend({
			name: 'testing',
			query: function(Model, options, callback) {
				if (shouldBe.sel) {
					should(options.sel).eql(shouldBe.sel);
				}
				if (shouldBe.unsel) {
					should(options.unsel).eql(shouldBe.unsel);
				}
				callback(null, {});
			}
		});
		var connector = new MyConnector();
		var model = orm.Model.define('user',{
			connector: connector
		});

		function noop() { }

		shouldBe = { sel: { name: 1 } };
		model.query({ sel: { name: 1 } }, noop);
		model.query({ sel: 'name' }, noop);
		
		shouldBe = { sel: { name: 1, age: 1 } };
		model.query({ sel: { name: 1, age: 1 } }, noop);
		model.query({ sel: 'name,age' }, noop);
	});

	it('should translate $like', function(done) {
		var MyConnector = orm.Connector.extend({
			name: 'testing',
			translateWhereRegex: true,
			query: function(Model, options, callback) {
				should(options.where).be.ok;
				should(options.where.name).be.ok;
				should(options.where.name.$regex).be.ok;
				should(options.where.name.$regex).eql('^Hello.*$');
				done();
			}
		});
		var connector = new MyConnector();
		var model = orm.Model.define('user', {
			connector: connector
		});

		function noop() { }

		model.query({ name: { $like: 'Hello%' } }, noop);
	});

	it('API-398: should handle skip: 0 properly', function() {
		var MyConnector = orm.Connector.extend({
				name: 'testing',
				query: function(Model, options, callback) {
					should(options.skip).eql(0);
					should(options.where).be.not.ok;
					callback(null, {});
				}
			}),
			connector = new MyConnector(),
			model = orm.Model.define('user', {
				connector: connector
			});

		function noop() { }

		model.query({ skip: 0 }, noop);
	});

	describe("#lifecycle", function(){

		it("should support no lifecycle methods", function(callback){
			var MyConnector = orm.Connector.extend({name:'MyConnector'});
			var connector = new MyConnector();
			connector.connect(callback);
		});

		it("should support override of base config with constructor config", function(callback){
			var MyConnector = orm.Connector.extend({
				name: 'MyConnector',
				config: {foo:'bar'}
			});
			var connector = new MyConnector({
				foo: 'hello'
			});
			connector.connect(function(err){
				should(err).not.be.ok;
				should(connector.config).be.an.object;
				should(connector.config).have.property('foo','hello');
				callback();
			});
		});

		it("should support custom connect", function(callback){
			var called;
			var MyConnector = orm.Connector.extend({
				name: 'MyConnector',
				connect: function(callback) {
					called = true;
					callback();
				}
			});
			var connector = new MyConnector();
			connector.connect(function(err){
				should(err).be.not.ok;
				should(called).be.ok;
				callback();
			});
		});

		it("should support validating config from schema", function(next){
			var MyConnector = orm.Connector.extend({
				name: 'MyConnector',
				fetchMetadata: function(callback) {
					callback(null, {
						fields: [
							{
								name: 'url',
								required: true,
								default: '',
								validator: new RegExp(
									"^" +
										// protocol identifier (optional) + //
									"(?:(?:https?:)?//)?" +
										// user:pass authentication (optional)
									"(?:\\S+(?::\\S*)?@)?" +
										// host (optional) + domain + tld
									"(?:(?!-)[-a-z0-9\\u00a1-\\uffff]*[a-z0-9\\u00a1-\\uffff]+(?!./|\\.$)\\.?){2,}" +
										// server port number (optional)
									"(?::\\d{2,5})?" +
										// resource path (optional)
									"(?:/\\S*)?" +
									"$", "i"
								)
							}
						]
					});
				}
			});

			var connector = new MyConnector();
			connector.connect(function(err) {
				should(err).be.ok;
				should(err.message).containEql('url is a required config property');

				connector = new MyConnector({
					url: ''
				});
				connector.connect(function(err) {
					should(err).be.ok;
					should(err.message).containEql('url is a required config property');

					connector = new MyConnector({
						url: 'ht://bad'
					});
					connector.connect(function(err) {
						should(err).be.ok;
						should(err.message).containEql('for url is invalid for the');

						connector = new MyConnector({
							url: 'http://a.good.com/url/for/the/config'
						});
						connector.connect(function(err) {
							should(err).be.not.ok;
							next();
						});
					});
				});
			});
		});

		it("should support only fetchConfig method", function(callback){
			var MyConnector = orm.Connector.extend({
				name: 'MyConnector',
				fetchConfig: function(callback) {
					callback(null, {foo:'bar'});
				}
			});
			var connector = new MyConnector();
			connector.connect(function(err){
				should(err).not.be.ok;
				should(connector.config).be.an.object;
				should(connector.config).have.property('foo','bar');
				callback();
			});
		});

		it("should support only fetchConfig but constructor should override", function(callback){
			var MyConnector = orm.Connector.extend({
				name: 'MyConnector',
				fetchConfig: function(callback) {
					callback(null, {foo:'bar'});
				}
			});
			var connector = new MyConnector({
				foo:'hello'
			});
			connector.connect(function(err){
				should(err).not.be.ok;
				should(connector.config).be.an.object;
				should(connector.config).have.property('foo','hello');
				callback();
			});
		});

		it("should support only fetchSchema only", function(callback){
			var MyConnector = orm.Connector.extend({
				name: 'MyConnector',
				fetchSchema: function(callback) {
					callback(null, {foo:'bar'});
				}
			});
			var connector = new MyConnector();
			connector.connect(function(err){
				should(err).not.be.ok;
				should(connector.metadata).be.an.Object;
				should(connector.metadata).have.property('schema');
				should(connector.metadata.schema).have.property('foo','bar');
				callback();
			});
		});

		it("should support only fetchMetadata only", function(callback){
			var MyConnector = orm.Connector.extend({
				name: 'MyConnector',
				fetchMetadata: function(callback) {
					callback(null, {foo:'bar'});
				}
			});
			var connector = new MyConnector();
			connector.connect(function(err){
				should(err).not.be.ok;
				should(connector.metadata).be.an.object;
				should(connector.metadata).have.property('foo','bar');
				callback();
			});
		});

		it("should support only fetchSchema and fetchMetadata", function(callback){
			var MyConnector = orm.Connector.extend({
				name: 'MyConnector',
				fetchSchema: function(callback) {
					callback(null, {foo:'bar'});
				},
				fetchMetadata: function(callback) {
					callback(null, {foo:'bar'});
				}
			});
			var connector = new MyConnector();
			connector.connect(function(err){
				should(err).not.be.ok;
				should(connector.metadata).be.an.object;
				should(connector.metadata).have.property('foo','bar');
				should(connector.metadata.schema).be.an.object;
				should(connector.metadata.schema).have.property('foo','bar');
				callback();
			});
		});

		it("should support custom primary key type using idAttribute", function(){
			var MyConnector = orm.Connector.extend({
				name: 'MyConnector',
				idAttribute: 'foo'
			});
			var connector = new MyConnector();
			var User = orm.Model.define('user',{
				fields: {
					name: {type: String }
				}
			});
			var pk = connector.getPrimaryKey(User,{foo:123});
			should(pk).be.equal(123);
		});

		it("should support custom primary key type using override", function(){
			var MyConnector = orm.Connector.extend({
				name: 'MyConnector',
				getPrimaryKey: function(Model, data) {
					return 123;
				}
			});
			var connector = new MyConnector();
			var User = orm.Model.define('user',{
				fields: {
					name: {type: String }
				}
			});
			var pk = connector.getPrimaryKey(User,{foo:123});
			should(pk).be.equal(123);
		});

	});

	describe('#events',function() {
		it ('should support event emitter events on instance', function(){
			var MyConnector = orm.Connector.extend({name:'MyConnector'});
			var connector = new MyConnector();
			var foo;
			connector.on('foo',function(value){
				foo = value;
			});
			connector.emit('foo',1);
			should(foo).be.ok;
			should(foo).equal(1);
			connector.removeAllListeners();
			foo = null;
			connector.emit('foo',2);
			should(foo).be.null;
			foo = null;
			function listener(value){
				foo = value;
			}
			connector.on('foo',listener);
			connector.emit('foo',1);
			should(foo).be.ok;
			should(foo).equal(1);
			connector.removeListener('foo',listener);
			foo = null;
			connector.emit('foo',2);
			should(foo).be.null;
		});
		it ('should support register event', function(){
			var foo;
			function listener(value){
				foo = value;
			}
			orm.Connector.on('register',listener);
			var MyConnector = orm.Connector.extend({});
			var connector = new MyConnector();
			should(foo).be.ok;
			should(foo).equal(connector);
			orm.Connector.removeListener('register',listener);
			orm.Connector.removeAllListeners();
			foo = null;
			var MyConnector2 = orm.Connector.extend({});
			var connector2 = new MyConnector2();
			should(foo).be.null;
		});
	});

	describe('memory', function(){

		it('should support queries', function(done){
			var MemoryConnector = require('../lib/connector/memorydb'),
				connector = new MemoryConnector(),
				User = orm.Model.define('user',{
					fields: {
						name: { type:String },
					},
					connector: connector
				});

			async.series([
				function(cb) {
					User.create({name:'Jeff'},cb);
				},
				function(cb) {
					User.create({name:'Nolan'},cb);
				},
				function(cb) {
					User.create({name:'Dawson'},cb);
				},
				function(cb) {
					User.create({name:'Tony'},cb);
				},
				function(cb) {
					User.query({where:{name:'Jeff'}}, function(err,result){
						should(err).not.be.ok;
						should(result).have.length(1);
						should(result[0].get('name')).be.equal('Jeff');
						cb();
					});
				},
				function(cb) {
					User.query({limit:1}, function(err,result){
						should(err).not.be.ok;
						should(result).have.length(1);
						cb();
					});
				},
				function(cb) {
					User.query({limit:1, sort:{name:-1}}, function(err,result){
						should(err).not.be.ok;
						should(result).have.length(1);
						should(result[0].get('name')).be.equal('Tony');
						cb();
					});
				},
				function(cb) {
					User.query({limit:1, sort:{name:1}}, function(err,result){
						should(err).not.be.ok;
						should(result).have.length(1);
						should(result[0].get('name')).be.equal('Dawson');
						cb();
					});
				},
				function(cb) {
					User.query({where: {$or: [{name:'Jeff'},{name:'Nolan'}]}, sort:{name:1}}, function(err,result){
						should(err).not.be.ok;
						should(result).have.length(2);
						should(result[0].get('name')).be.equal('Jeff');
						should(result[1].get('name')).be.equal('Nolan');
						cb();
					});
				}

			], done);
		});

	});

});
