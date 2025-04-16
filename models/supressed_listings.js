'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SupressedListing extends Model {
  }

  SupressedListing.init(
    {
      ASIN: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      seller_sku: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      product_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      reason: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      condition: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      status_change_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      issue_description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'SupressedListing',
      tableName: 'supressed_listings',
      timestamps: true,
    }
  );

  return SupressedListing;
};
