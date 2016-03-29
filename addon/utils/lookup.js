import Ember from 'ember';

/**
  Method looking validator by name.
  @module
  @function lookup
  @param {String} name
  @param {Ember.Container} container
  @return Validator
*/
export default function(name, container) {
  let validator = null;
  Ember.assert("An application container should be provided", container);
  Ember.assert("Provide a validator name", !Ember.isEmpty(name));
  validator = container.lookupFactory('validator:' + name);
  Ember.assert("Validator named '" + name + "' is not found", validator);
  return validator;
}
