'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class TrackedProduct extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      TrackedProduct.belongsTo(models.Product, {
        foreignKey: 'product_id',
        as: 'product',
      });
    }
  }
  TrackedProduct.init(
    {
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
      },
      current_rank: DataTypes.INTEGER,
      thirty_days_rank: DataTypes.INTEGER,
      ninety_days_rank: DataTypes.INTEGER,
      units_sold: DataTypes.INTEGER,
      product_velocity: DataTypes.FLOAT,
      product_velocity_2: DataTypes.FLOAT,
      product_velocity_7: DataTypes.FLOAT,
      product_velocity_15: DataTypes.FLOAT,
      product_velocity_60: DataTypes.FLOAT,
      lowest_fba_price: DataTypes.FLOAT,
      fees: DataTypes.FLOAT,
      profit: DataTypes.FLOAT,
      is_active: DataTypes.BOOLEAN,
    },
    {
      sequelize,
      modelName: 'TrackedProduct',
      timestamps: true,
    }
  );
  return TrackedProduct;
};
