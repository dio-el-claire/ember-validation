import Ember from "ember";
import DS from "ember-data";
import ValidationMixin from "ember-validation/mixins/validation";
import ModelValidatorMediator from 'ember-validation/mediator/model-validator';

export default Ember.Mixin.create(ValidationMixin, {

  /**
    @method _createValidatorMediator
    @param {Validator} validator
    @param {Object} options
    @param {Object} context
    @return Ember.Array
  */
  _createValidatorMediator(attribute, validator, options={}, context=this) {
    return ModelValidatorMediator.extend(options).create({ context, attribute, validator });
  }

});
