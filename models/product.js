'use strict';
const {
 Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
 class Product extends Model {
    static associate(models) {
      // define association here
    }
 }
 Product.init({
    ASIN: DataTypes.STRING,
    product_image: DataTypes.STRING,
    product_name: DataTypes.STRING,
    seller_sku: DataTypes.STRING,
    FBA_available_inventory: DataTypes.INTEGER,
    FC_transfer: DataTypes.INTEGER,
    Inbound_to_FBA: DataTypes.INTEGER,
    supplier_name: DataTypes.STRING,
    supplier_item_number: DataTypes.STRING,
    product_cost: DataTypes.FLOAT,
    pack_type: DataTypes.STRING
 }, {
    sequelize,
    modelName: 'Product',
 });
 return Product;
};
