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

	it('should be able to register and retrieve connectors',function(){
		var MyConnector = orm.Connector.extend({});

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

		var MyConnector = orm.Connector.extend({});
		should(MyConnector).be.an.object;

		var connector = new MyConnector();

		should(connector).be.an.object;
	});

	it('should be able to create with config',function(){

		var MyConnector = orm.Connector.extend({});

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

		var MyConnector = orm.Connector.extend({});

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
			login: function(request, next) {
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

		var User = orm.Model.define('user',{
			fields: {
				name: {
					type: String,
					default: 'Jeff',
				}
			},
			connector: connector
		});

		var UserPromise = User.createRequest(request);

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

	describe("#lifecycle", function(){

		it("should support no lifecycle methods", function(callback){
			var MyConnector = orm.Connector.extend({});
			var connector = new MyConnector();
			connector.connect(callback);
		});

		it("should support override of base config with constructor config", function(callback){
			var MyConnector = orm.Connector.extend({
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

		it("should support only fetchConfig method", function(callback){
			var MyConnector = orm.Connector.extend({
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
				fetchSchema: function(callback) {
					callback(null, {foo:'bar'});
				}
			});
			var connector = new MyConnector();
			connector.connect(function(err){
				should(err).not.be.ok;
				should(connector.metadata).be.an.object;
				should(connector.metadata).have.property('schema');
				should(connector.metadata.schema).have.property('foo','bar');
				callback();
			});
		});

		it("should support only fetchMetadata only", function(callback){
			var MyConnector = orm.Connector.extend({
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

	});

	describe('#events',function() {
		it ('should support event emitter events on instance', function(){
			var MyConnector = orm.Connector.extend({});
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

});
