'use strict';
const {
 Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
 class Product extends Model {
    static associate(models) {
      Product.hasMany(models.TrackedProduct, {
         foreignKey: 'product_id',
         as: 'trackedproducts'
       });
    }
 }
 Product.init({
    ASIN: DataTypes.STRING,
    product_image: DataTypes.STRING,
    product_name: DataTypes.STRING,
    seller_sku: DataTypes.STRING.BINARY,
    FBA_available_inventory: DataTypes.INTEGER,
    reserved_quantity: DataTypes.INTEGER,
    Inbound_to_FBA: DataTypes.INTEGER,
    supplier_name: DataTypes.STRING,
    supplier_item_number: DataTypes.STRING,
    product_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
     },
    pack_type: DataTypes.STRING,
    is_active: DataTypes.BOOLEAN
 }, {
    sequelize,
    modelName: 'Product',
 });
 return Product;
};
