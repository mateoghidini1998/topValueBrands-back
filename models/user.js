'use strict';
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const {
  Model
} = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
    getSignedJwtToken() {
      return jwt.sign({ id: this.id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE
      });
    }

    matchPassword(enteredPassword) {
      try {
        const isMatch = bcrypt.compareSync(enteredPassword.trim(), this.password.trim());
        return isMatch;
      } catch (error) {
        return false;
      }
    }
  }
  User.init({
    firstName: DataTypes.STRING,
    lastName: DataTypes.STRING,
    email: DataTypes.STRING,
    password: DataTypes.STRING,
    role: DataTypes.ENUM('admin', 'employee')
  }, {
    sequelize,
    modelName: 'User',
    hooks: {
      beforeCreate: async (user, options) => {
        console.log(user)
        if(user.password){
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      }
    }
  });
  return User;
};