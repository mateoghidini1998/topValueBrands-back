'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ListingStatus extends Model {
    static associate(models) {
      ListingStatus.hasMany(models.Product, {
        foreignKey: 'listing_status_id',
        as: 'products'
      });
    }
  }
  
  ListingStatus.init({
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
    modelName: 'ListingStatus',
    tableName: 'listings_status',
    timestamps: true
  });
  
  return ListingStatus;
}; 