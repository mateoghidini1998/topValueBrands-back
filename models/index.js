'use strict';

const dotenv = require('dotenv');
dotenv.config({ path: './.env' }); // Carga las variables de entorno desde el archivo .env

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const process = require('process');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'local'; // Usamos 'local' como predeterminado si no se establece NODE_ENV
const config = require(__dirname + '/../config/config.json')[env];
const db = {};

console.log(`Running in ${env} mode`);
console.log(config);

let sequelize;

if (config.use_env_variable) {
  const connectionString = process.env[config.use_env_variable];
  console.log(`Using connection string from environment variable: ${config.use_env_variable}`);
  sequelize = new Sequelize(connectionString, {
    ...config,
    pool: {
      max: 10,       
      min: 2,        
      acquire: 30000, 
      idle: 10000    
    }
  });
} else {
  console.log(`Using individual database parameters from configuration.`);
  sequelize = new Sequelize(config.database, config.username, config.password, {
    ...config,
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000
    }
  })
}

// Resto de la configuración del modelo permanece igual...
fs.readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      file.indexOf('.test.js') === -1
    );
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;