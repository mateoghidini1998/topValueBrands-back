const purchaseOrderRepository = require("../repositories/purchase-order.repository")
const { sequelize } = require('../models') 

const findById = async (id) => {
    const purchaseOrder = await purchaseOrderRepository.FindById(id)
    if (!purchaseOrder) {
        throw new Error("Purchase order not found")
    }

    return purchaseOrder
}

module.exports = {
    findById
}