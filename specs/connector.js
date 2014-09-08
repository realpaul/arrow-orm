var should = require('should'),
	async = require('async'),
	util = require('util'),
	orm = require('../');

describe('connectors',function(){

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

});
