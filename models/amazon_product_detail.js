"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class AmazonProductDetail extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      AmazonProductDetail.belongsTo(models.Product, {
        foreignKey: "product_id",
        as: "product",
      });
    }
  }
  AmazonProductDetail.init(
    {
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
      },
      ASIN: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      FBA_available_inventory: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      reserved_quantity: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      Inbound_to_FBA: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      selling_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      },
      dangerous_goods: {
        type: DataTypes.STRING,
      },
      is_hazmat: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },
      hazmat_value: {
        type: DataTypes.STRING,
        defaultValue: "STANDARD",
        allowNull: true,
      },
      fc_transfer: {
        type: DataTypes.STRING,
        defaultValue: null,
        allowNull: true,
      },
      fc_processing: {
        type: DataTypes.STRING,
        defaultValue: null,
        allowNull: true,
      },
      customer_order: {
        type: DataTypes.STRING,
        defaultValue: null,
        allowNull: true,
      },
      isActiveListing: {
        type: DataTypes.BOOLEAN,
        defaultValue: null,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "AmazonProductDetail",
      tableName: "amz_product_details",
      timestamps: true,
    }
  );
  return AmazonProductDetail;
};
