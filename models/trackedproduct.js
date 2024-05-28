'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class TrackedProduct extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  TrackedProduct.init({
    ASIN: DataTypes.STRING,
    seller_sku: DataTypes.STRING,
    current_rank: DataTypes.INTEGER,
    thirty_days_rank: DataTypes.INTEGER,
    ninety_days_rank: DataTypes.INTEGER,
    units_sold: DataTypes.INTEGER,
    product_velocity: DataTypes.FLOAT,
  }, {
    sequelize,
    modelName: 'TrackedProduct',
  });
  return TrackedProduct;
};