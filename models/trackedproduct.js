'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class AmzTrackedProduct extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      AmzTrackedProduct.belongsTo(models.AmzProduct, {
        foreignKey: 'amz_product_id',
        as: 'amz_product',
      });
    }
  }
  AmzTrackedProduct.init(
    {
      amz_product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
      },
      current_rank: DataTypes.INTEGER,
      thirty_days_rank: DataTypes.INTEGER,
      ninety_days_rank: DataTypes.INTEGER,
      units_sold: DataTypes.INTEGER,
      product_velocity: DataTypes.FLOAT,
      lowest_fba_price: DataTypes.FLOAT,
      fees: DataTypes.FLOAT,
      profit: DataTypes.FLOAT,
      is_active: DataTypes.BOOLEAN,
    },
    {
      sequelize,
      modelName: 'AmzTrackedProduct',
      timestamps: true,
    }
  );
  return AmzTrackedProduct;
};
