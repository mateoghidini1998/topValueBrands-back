const { QueryTypes } = require('sequelize');
const { TrackedProduct, sequelize } = require('../models');

const FindAllTrackedProducts = async () => {
    return await TrackedProduct.findAll();
}

const FindTrackedProductById = async (id) => {
    return await TrackedProduct.findByPk(id);
}


module.exports = {
    FindAllTrackedProducts,
    FindTrackedProductById,  
}