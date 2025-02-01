module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Eliminar la clave foránea incorrecta
    await queryInterface.removeConstraint(
      'outgoingshipmentproducts', 
      'outgoingshipmentproducts_ibfk_2' 
    );

    await queryInterface.addConstraint('outgoingshipmentproducts', {
      fields: ['pallet_product_id'],
      type: 'foreign key',
      name: 'fk_outgoing_shipmentproducts_pallet_product_id',
      references: {
        table: 'palletproducts',
        field: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    await queryInterface.addConstraint('outgoingshipmentproducts', {
      fields: ['outgoing_shipment_id'],
      type: 'foreign key',
      name: 'fk_outgoing_shipmentproducts_outgoing_shipment_id',
      references: {
        table: 'outgoingshipments',
        field: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.addConstraint('outgoingshipmentproducts', {
      fields: ['pallet_product_id'],
      type: 'foreign key',
      name: 'outgoingshipmentproducts_ibfk_2',
      references: {
        table: 'purchaseorderproducts', 
        field: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    await queryInterface.removeConstraint(
      'outgoingshipmentproducts',
      'fk_outgoing_shipmentproducts_pallet_product_id'
    );

    await queryInterface.removeConstraint(
      'outgoingshipmentproducts',
      'fk_outgoing_shipmentproducts_outgoing_shipment_id'
    );
  },
};
