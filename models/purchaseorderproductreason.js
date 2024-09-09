'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PurchaseOrderProductReason extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here

    }
  }
  PurchaseOrderProductReason.init({
    description: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'PurchaseOrderProductReason',
  });
  return PurchaseOrderProductReason;
};