import Ember from "ember";
import DS from "ember-data";
import ValidationMixin from "ember-validation/mixins/model";

const { computed } = Ember;
const { attr } = DS;

const GENDERS = {
  MALE: "male",
  FEMALE: "female",
  UNKNOWN: "",
};

export default DS.Model.extend(ValidationMixin, {

  /**
    @property _validationScheme
    @type Object
    @protected
    @final
  */
  validationScheme: {

    first_name: {
      validators: [
        { name: "required", options: { message: "first_name_required" } }
      ]
    },

    last_name: {
      validators: [
        { name: "required", options: { message: "last_name_required" } }
      ]
    },

    full_name: {
      validators: [
        { name: "required", options: { message: "full_name_required" } }
      ]
    },

    gender: {
      validators: [
        { name: "required", options: { message: "gender_is_required" } }
      ]
    },

    age: {
      options: {
        isUnknown: computed.equal("context.gender", GENDERS.UNKNOWN),
        condition: computed.not("isUnknown")
      },
      validators: [
        { name: "number", options: { min: 21, max: 65, message: "age_is_wrong_for_male", condition: computed.equal("context.gender", GENDERS.MALE) } },
        { name: "number", options: { min: 18, max: 55, message: "age_is_wrong_for_female", condition: computed.equal("context.gender", GENDERS.FEMALE) } }
      ]
    }

  },

  first_name: attr("string"),
  last_name: attr("string"),
  gender: attr("string", { defaultValue: GENDERS.UNKNOWN }),
  age: attr("number"),
  email: attr("string"),

  full_name: computed("first_name", "last_name", function() {
    return [this.get("first_name"), this.get("last_name")].join(" ");
  })

});
