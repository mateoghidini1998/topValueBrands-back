'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Marketplace extends Model {
    static associate(models) {
      Marketplace.hasMany(models.Product, {
        foreignKey: 'marketplace_id',
        as: 'products'
      });
    }
  }
  
  Marketplace.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Marketplace',
    tableName: 'marketplaces',
    timestamps: true
  });
  
  return Marketplace;
}; 