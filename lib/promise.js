var _ = require('lodash'),
	chalk = require('chalk'),
	async = require('async'),
	debug = require('debug')('orm:promise');

exports = module.exports = Promise;

/**
 * create Promise is an internal private class used to invoke
 * a Connector request flow by putting some additional properties
 * on the `this` object before invoke Connector implementation methods.
 * It also ensures that before any methods are implemented, if a
 * Connector implementation requires login, it will be called prior to
 * any connector methods (such as findAll, create, etc).
 */
function Promise (request, _connector) {
	var context = this;

	// lifecycle methods
	var startRequest = _connector.startRequest && _connector.startRequest.bind(context);
	var endRequest = _connector.endRequest && _connector.endRequest.bind(context);
	var loginRequired = _connector.loginRequired && _connector.loginRequired.bind(context);
	var login = _connector.login && _connector.login.bind(context);

	// we want to exclude them when we patch up the dispatcher
	var exclude = [_connector.startRequest, _connector.endRequest, _connector.loginRequired, _connector.login];

	var properties = _.defaults(Object.getPrototypeOf(_connector),_connector);

	Object.keys(properties).forEach(function propertyIterator(name){
		var fn = _connector[name];
		if (exclude.indexOf(fn)===-1) {
			if (typeof fn !== 'function') {
				this[name] = fn;
				return;
			}
			this[name] = function promiseFunction() {
				var tx = request.tx.start('connector:'+_connector.name+':'+name,false,_connector.filename,_connector.description);
				
				//create a logger dispatcher that will dispatch each connector logger log also to our request tx log
				LogMultiplexer(request, _connector, tx);

				debug(chalk.magenta.bold('--> '+name));
				var tasks = [],
					callback = arguments[arguments.length-1],
					args = Array.prototype.slice.call(arguments),
					result;

				if (startRequest) {
					tasks.push(function startRequestTask(next){
						try {
							debug(chalk.grey(' == startRequest'));
							startRequest.apply(context,[name,args,request,next]);
						}
						catch (E) {
							next(E);
						}
					});
				}
				if (loginRequired) {
					tasks.push(function loginRequiredTask(next){
						try {
							debug(chalk.grey(' == loginRequired'));
							loginRequired(request,function loginRequiredCallback(err,required){
								if (err) { return next(err); }
								if (required) {
									if (!login) {
										return callback("login required but no login method defined in the Connector");
									}
									debug(chalk.grey(' == login'));
									login(request, next);
								}
								else {
									debug(chalk.grey(' == login not required'));
									next();
								}
							});
						}
						catch (E) {
							next(E);
						}
					});
				}
				tasks.push(function promiseTask(next){
					try {
						debug(chalk.grey(' ==> '+name));
						args[args.length-1] = function promiseTaskCallback() {
							debug(chalk.grey(' <== '+name));
							result = arguments;
							next.apply(context,arguments);
						};
						fn.apply(context,args);
					}
					catch (E) {
						next(E);
					}
				});
				if (endRequest) {
					tasks.push(function endRequestTask(next){
						try {
							debug(chalk.grey(' == endRequest'));
							endRequest.apply(context,[name,args,request,next]);
						}
						catch (E) {
							next(E);
						}
					});
				}
				async.series(tasks, function completeCallback(err){
					tx.end();
					if (err) { return callback(err); }
					debug(chalk.magenta.bold('<-- '+name));
					callback.apply(context, result);
				});
			};
		}
	}.bind(this));

	// map login specially so that it will set the request before invoking
	// the real method
	this.login = function loginDelegate(callback) {
		if (_connector.login) {
			login(request, callback);
		}
		else {
			callback();
		}
	}.bind(this);

}

function LogMultiplexer(request, connector, tx) {
	['info','error','warn','debug','trace'].forEach(function(level){
		var fn = connector.logger[level];
		var newfn = function logDispatch() {
			fn.apply(connector.logger, arguments);
			// dispatch to request tx logger
			//request.log[level].apply(request.log, arguments);
			tx.log[level].apply(tx.log,arguments);
		};
		connector.logger[level] = newfn;
	});
}