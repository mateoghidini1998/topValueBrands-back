'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Order extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Order.init({
    amazon_order_id: DataTypes.STRING,
    purchase_date: DataTypes.DATE,
    order_status: DataTypes.STRING,
    sku: DataTypes.STRING,
    ASIN: DataTypes.STRING,
    quantity: DataTypes.INTEGER,
    currency: DataTypes.STRING,
    price: DataTypes.DECIMAL(10, 2),
  }, {
    sequelize,
    modelName: 'Order',
  });
  return Order;
};