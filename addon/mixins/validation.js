import Ember from 'ember';
import ValidatableMixin from 'ember-validation/mixins/validatable';
import AttributeMediator from 'ember-validation/mediators/attribute';
import ValidatorMediator from 'ember-validation/mediators/validator';
import ProxyMediator from 'ember-validation/mediators/proxy';
import Errors from 'ember-validation/core/errors';
import Config from 'ember-validation/configuration';
import { lookupValidator, lookupPreset } from 'ember-validation/utils/lookup';

const { RSVP, computed, get, assert, Logger, getWithDefault, tryInvoke } = Ember;

var findMediators = function(...names) {
    assert("You should provide at least one attribute name", !Ember.isEmpty(names));

    // Iterating over the names (of attributes) and getting mediators.
    const mediators = Ember.A(names).map((name) => {
      let mediator = this.get("mediators").findBy("attribute", name);
      assert("Mediator for attribute named `" + name + "` not found", mediator);
      return mediator;
    });

    return mediators;
};


/**
 * @module ember-validation/mixins/validation
 * @extends Ember.Mixin
 * @augmented Ember.Evented
 * @augmented module:ember-validation/mixins/validatable
 */
export default Ember.Mixin.create(ValidatableMixin, Ember.Evented, {

  /**
    Defines the properties that will be merged from the superclass
    (instead of overridden).
    @type Array
    @default null
    @public
  */
  mergedProperties: ["validationScheme"],

  /**
    A collection that contains all validators of the class instance that
    implements current mixin. The property fills up by the `initValidation`
    method from `validationScheme` (contains instruction to create validators).
    @type {Array}
  */
  mediators: computed(() => Ember.A()),

  /**
    This is an instruction for creating validators for an object that implements
    current mixin. The structure of it is following:

    @example:
      validationScheme
        attribute
          options: ATTRIBUTE_VALIDATION_OPTIONS,
          validators[]
            { name: VALIDATOR_NAME, options: VALIDATOR_OPTIONS }

    The method fills `validators` collection by validators and invoke each of
    them on `validate` method.

    @type Object
    @protected
  */
  validationScheme: computed(() => { return {}; }),

  init() {
    this.initErrors();
    this.initValidation();
    this.initStates();
    return this._super(...arguments);
  },

  initStates() {
      // The class already has a state, it means that the class has isValid and
      // isInvalid states as well.
      if (this.get("currentState")) {
          return;
      }

      Ember.defineProperty(this, "isValid", computed("errors.length", () => {
        return this.get("errors.length") === 0;
      }));

      Ember.defineProperty(this, "isInvalid", computed.not("isValid"));
  },

  initErrors() {
    this.get("errors") || this.set("errors", Errors.create());
  },

  /**
    Method creates validators for every object's attribute from the
    `validationScheme`. Validators are gets from the registry by names. Default
    namespace for them is `validator:`, that means that they are should be
    placed in the `validators/` project directory.

    Validators creates and wrappes by an attribute mediator. It has the same
    interface as they are. The mediators triggers events every time when they
    called.

    @method initValidation
    @private
  */
  initValidation() {

    const validationScheme = this.get("validationScheme");

    if (Ember.isBlank(Object.keys(validationScheme))) {
      // The object doesn't have a validation scheme. Probably it has validation
      // schemes on every it's attribute.
      var attributes = get(this.constructor, "attributes");

      attributes && attributes.forEach(item => {
        Config.LOG_VALIDATION && Logger.log("Validation : <<mixin>> : Validation : looking preset for type %s", item.type);
        let { type, name, options } = item;
        if (options && get(options, "preset")) {
          type = get(options, "preset");
        }
        if (!options.isValidatable) { return; }
        let preset = lookupPreset(type, get(this, "container"));
        Config.LOG_VALIDATION && Logger.log("Validation : <<mixin>> : Validation : preset found %o", preset.create(item));
        validationScheme[name] = preset.create(item).evolve();
      });
    }

    return this._initValidationByScheme(validationScheme);
  },

  _initValidationByScheme(validationScheme) {

    // Getting the object's properties that should have validation.
    const attributes = Ember.A(Object.keys(validationScheme));

    attributes.forEach((attribute) => {

      // Instruction to create validators for the attribute
      let validation = get(validationScheme, attribute);

      assert("Every validation should contain validators", validation);

      // A list of the validator instances
      let validatorHashes = this._createValidators(attribute, validation);

      let options = getWithDefault(validation, "options", {});
      let groupMediator = null;

      if (options.proxy) {
        groupMediator = ProxyMediator.extend(options).create({ context: this, attribute, options });
      } else {
        groupMediator = this._createGroupMediator(attribute, options);
      }

      // Iterating over the attribute's validators and wrap each of them by a
      // mediator, that has the same interface then they are.
      validatorHashes.forEach((hash) => {
        let options = get(hash, "options");
        let validator = get(hash, "validator");
        let validatorMediator = this._createValidatorMediator(attribute, validator, options);
        groupMediator.pushObject(validatorMediator);
      });

      groupMediator.on("passed", () => {
        Config.LOG_VALIDATION && Logger.log("Validation : <<mixin>> : Validation : %cevent::Mediator.passed%c on attribute '%s'", "color: #090", null, attribute);
        this.get("errors").remove(attribute);
      });

      groupMediator.on("failed", (message) => {
        Config.LOG_VALIDATION && Logger.log("Validation : <<mixin>> : Validation : %cevent::Mediator.failed%c on attribute '%s' with errors %o", "color: #900", null, attribute, message);
        // To prevent occurring of the inconsistent state error
        // this.transitionTo && this.transitionTo("updated.uncommitted");
        if (!get(message, "options.proxy") || (get(message, "options.proxy") && get(message, "options.required"))) {
          this.get("errors").remove(attribute);
          this.get("errors").add(attribute, message);
          this.get("errors").arrayContentDidChange();
        }
      });

      // @todo: It's broken for proxy validation.
      // groupMediator.on("conditionChanged", () => {
      //   Config.LOG_VALIDATION && Logger.log("Validation : <<mixin>> : Validation : event::Mediator.conditionChanged on attribute '%s'", attribute);
      //   this.get("errors").remove(attribute);
      // });

      // mediators.pushObject(groupMediator);
      this.addMediator(groupMediator);
    });

  },

  /**
    Add mediator to mediators list and fire event

    @method addMediator
    @param Mediator
    @trigger mediatorDidAdd
    @return undefined
  */
  addMediator(mediator) {
    const attrName = get(mediator, "attribute");
    this.get("mediators").pushObject(mediator);
    this.trigger('mediatorDidAdd', mediator);
    Config.LOG_VALIDATION && Logger.log("Validation : <<mixin>> : Validation : addMediator %o for '%s'", mediator, attrName || get(mediator, "validate-path"), get(mediator, 'view.element') );
  },

  /**
    remove mediator from mediators list and fire event

    @method removeMediator
    @param Mediator
    @trigger mediatorWillRemove
    @return undefined
  */
  removeMediator(mediator) {
    const mediators = this.get("mediators");
    const attrName = get(mediator, "attribute");

    if (mediators.indexOf(mediator) !== -1) {
      this.trigger("mediatorWillRemove", mediator);
      mediators.removeObject(mediator);
      mediator.destroy();
      Config.LOG_VALIDATION && Logger.log("Validation : <<mixin>> : Validation : removeMediator %o for '%s'", mediator, attrName);
    }
  },

  /**
    Iterates over the elements of a validation collection, calls `validate` on
    each them, collect result of evaluation and put it into the `errors`
    property of the object.
    @method validate
    @return {Ember.RSVP.Promise}
  */
  validate() {
    if (Ember.isEmpty(arguments)) {
      return this._runMediators("validate", this.get("mediators"));
    } else {
      Ember.warn('You probably want to call `validateByName`', Ember.isEmpty(arguments));
      return this.validateByName(...arguments);
    }
  },

  /**
    This method the same as `validate`, only difference is that the `validate`
    fills errors of the object. This method may be helpful to you, if you want
    to check the object validation, but do not want fill it with errors.
    @method check
    @return {Ember.RSVP.Promise}
  */
  check() {
    if (Ember.isEmpty(arguments)) {
      return this._runMediators("check", this.get("mediators"));
    } else {
      Ember.warn('You probably want to call `checkByName`', Ember.isEmpty(arguments));
      return this.validateByName(...arguments);
    }
  },

  /**
    Method searching mediators by name and executes validation on each of them.
    May be helpful if you'd like to validate just few attributes of the object,
    not all of them.

    @example:
      // Validate only one field
      var promise = user.validateByName("firstName");

      // Validate few fields
      var promise = user.validateByName("firstName", "lastName", "birthday");

    @method validateByName
    @param {String[]} names
    @return {Ember.RSVP.Promise}
  */
  validateByName(...names) {
    return this._runMediators("validate", findMediators.call(this, ...names));
  },

  /**
    Method searching mediators by name and executes check method on each of them.
    May be helpful if you'd like to check just few attributes of the object,
    not all of them.

    @example:
      // Validate field
      var promise = user.checkByName("firstName", "lastName");

    @method checkByName
    @param {String[]} names
    @return {Ember.RSVP.Promise}
  */
  checkByName(...names) {
    return this._runMediators("check", findMediators.call(this, ...names));
  },

  /**
    @method clearErrors
  */
  clearErrors() {
    this.get("errors").clear();
  },

  /**
    @method clearErrorsByName
    @param {String} name
  */
  clearErrorsByName(name) {
    const attributeErrors = this.get("errors").filterBy("attribute", name);
    var errors = this.get("errors");
    attributeErrors.forEach((attr) => {
      errors = errors.without(attr);
    });
    this.set("errors", errors);
  },

  /**
    Iterating over the validators in collection and calling validate method
    each of them to fill object by errors.
    @method _runMediators
    @params {Array} mediators
    @private
    @return {Ember.RSVP.Promise}
  */
  _runMediators(method, mediators) {

    const deferred = RSVP.defer();
    const promise = deferred.promise;

    var promises = mediators.map((mediator) => tryInvoke(mediator, method));
        promises = promises.reduce((previous, item) => previous.concat(item), Ember.A());

    const settledPromise = RSVP.allSettled(promises);

    settledPromise.then((results) => {
      const rejected = Ember.A(results).filterBy("state", "rejected");
      if (rejected.length === 0) {
        Config.LOG_VALIDATION && Logger.log("Validation : <<mixin>> : Validation : _runMediators %c✓ passed", "color: #090");
        deferred.resolve();
      } else {
        Config.LOG_VALIDATION && Logger.log("Validation : <<mixin>> : Validation : _runMediators %c✘ failed", "color: #900");
        deferred.reject(Ember.A(rejected).mapBy("reason"));
      }
    });

    promise.then(() => {}, () => {});
    promise.finally(() => {
      mediators.forEach((mediator) => {
        this.get('errors').notifyPropertyChange(get(mediator, 'attribute'));
      });
    }).then(() => {}, () => {});

    return promise;
  },

  /**
    @method _createValidators
    @param {String} attribute
    @param {Object} validation
    @return {Array}
  */
  _createValidators(attribute, validation) {
    return Ember.A( get(validation, "validators") ).map((description) => {
      const name = get(description, "name");
      const options = get(description, "options");
      const validate = get(description, "validate");
      Ember.assert("Validator in the schema should contain 'name' or 'validate'", !!(name || validate));
      const validator = validate || lookupValidator(name, get(this, "container"));
      return { options, validator };
    });
  },

  /**
    @method _createGroupMediator
    @param {String} attribute
    @param {Object} options
    @param {Object} context
    @return {Array}
  */
  _createGroupMediator(attribute, options={}, context=this) {
    return AttributeMediator.extend(options).create({ context, attribute, options });
  },

  /**
    @method _createValidatorMediator
    @param {Validator} validator
    @param {Object} options
    @param {Object} context
    @return {Array}
  */
  _createValidatorMediator(attribute, validator, options={}, context=this) {
    return ValidatorMediator.extend(options).create({ context, attribute, validator, options });
  },

});
