import Ember from 'ember';

const { RSVP: { defer }, get, getProperties, merge } = Ember;

const defaultOptions = {
  "messages": {
    "out_of_range": "out_of_range"
  }
};

/**
* @function
* @param {String} attributeName
* @param {Object} context
* @param {Object} options
* @returns {ember/RSVP.defer}
* @module
* @public
*/
function validate(attributeName, context, options={}) {
  options = merge(defaultOptions, options)
  const deferred = defer();
  const value = get(context, attributeName);
  const { min, max } = getProperties(options, "min", "max");

  if (Ember.isBlank(value)) { deferred.resolve(); return deferred.promise; }

  if (!Ember.isNone(min) && value.length < min) {
    return deferred.reject(get(options, "messages.out_of_range")), deferred.promise;
  }

  if (!Ember.isNone(max) && value.length > max) {
    return deferred.reject(get(options, "messages.out_of_range")), deferred.promise;
  }

  deferred.resolve();

  return deferred.promise;
};

export default validate;
