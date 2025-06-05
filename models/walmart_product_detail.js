"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class WalmartProductDetail extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      WalmartProductDetail.belongsTo(models.Product, {
        foreignKey: "product_id",
        as: "product",
      });
    }
  }
  WalmartProductDetail.init(
    {
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
      },
      gtin: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      available_to_sell_qty: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.0,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
      in_seller_account: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
      wpid: {
        type: DataTypes.STRING,
        allowNull: true,
      }
    },
    {
      sequelize,
      modelName: "WalmartProductDetail",
      tableName: "wmt_product_details",
      timestamps: true,
    }
  );
  return WalmartProductDetail;
};
