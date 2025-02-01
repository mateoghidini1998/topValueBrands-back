'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class WarehouseLocation extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      WarehouseLocation.hasMany(models.Pallet, {
        foreignKey: 'warehouse_location_id',
        as: 'pallets'
      })
    }
  }
  WarehouseLocation.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    location: DataTypes.STRING,
    capacity: DataTypes.INTEGER,
    current_capacity: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'WarehouseLocation',
  });
  return WarehouseLocation;
};