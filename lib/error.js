
function ORMError(message) {
	this.message = message;
	Error.captureStackTrace(this, ORMError);
}

ORMError.prototype = Object.create(Error.prototype);
ORMError.prototype.constructor = ORMError;


function ValidationError(field, message) {
	this.field = field;
	ORMError.call(this,message);
}

ValidationError.prototype = Object.create(ORMError.prototype);
ValidationError.prototype.constructor = ValidationError;


exports.ValidationError = ValidationError;
exports.ORMError = ORMError;
