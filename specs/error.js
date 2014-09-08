var should = require('should'),
	orm = require('../');

describe('errors',function(){

	it('should define errors',function(){

		should(orm.ValidationError).be.an.object;
		should(orm.ORMError).be.an.object;

		var err = new orm.ORMError('hello');

		should(err instanceof orm.ORMError).be.true;
		should(err instanceof Error).be.true;
		should(err instanceof orm.ValidationError).be.false;

		err = new orm.ValidationError('somefield','hello');
		should(err instanceof orm.ORMError).be.true;
		should(err instanceof Error).be.true;
		should(err instanceof orm.ValidationError).be.true;
		should(err).have.property('field','somefield');

	});

	it('should handle errors',function(){
		(function(){
			throw new orm.ORMError('hello');
		}).should.throw('hello');

		(function(){
			throw new orm.ValidationError('bar','hello');
		}).should.throw('hello');

		try {
			throw new orm.ValidationError('bar','hello');
		}
		catch (E) {
			var msg = E.stack.split('\n');
			should(msg[0]).be.equal('Error: hello');
			should(msg[1].trim()).match(/^at new ValidationError/);
		}

	});

});
