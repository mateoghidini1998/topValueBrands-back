const { QueryTypes } = require('sequelize');
const { sequelize } = require("../models");

const FindAll = async () => {
  return await sequelize.query(
    `SELECT * FROM suppliers`,
    { type: QueryTypes.SELECT }
  );
};

const Create = async (supplier_name) => {
  return await sequelize.query(
    `INSERT INTO suppliers (supplier_name, createdAt, updatedAt) VALUES (:supplier_name, NOW(), NOW())`,
    { 
      replacements: { supplier_name }, 
      type: QueryTypes.INSERT 
    }
  );
};

const FindById = async (id) => {
  const result = await sequelize.query(
    `SELECT * FROM suppliers WHERE id = :id`,
    { 
      replacements: { id }, 
      type: QueryTypes.SELECT 
    }
  );
  return result.length ? result[0] : null;
};

const Update = async (id, supplier_name) => {
  return await sequelize.query(
    `UPDATE suppliers SET supplier_name = :supplier_name, updatedAt = NOW() WHERE id = :id`,
    { 
      replacements: { id, supplier_name }, 
      type: QueryTypes.UPDATE 
    }
  );
};

const Delete = async (id) => {
  return await sequelize.query(
    `DELETE FROM suppliers WHERE id = :id`,
    { 
      replacements: { id }, 
      type: QueryTypes.DELETE 
    }
  );
};

module.exports = {
  FindAll,
  FindById,
  Create,
  Update,
  Delete
};
