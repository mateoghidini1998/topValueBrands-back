const { QueryTypes } = require('sequelize');
const { OutgoingShipment, sequelize } = require('../models');

const FindAll = async ({
    whereClause,
    replacements,
    orderBy,
    orderWay,
    limit,
    offset,
}) => {
    const outgoing_shipments = await sequelize.query(
        `
            
        `
    )
}