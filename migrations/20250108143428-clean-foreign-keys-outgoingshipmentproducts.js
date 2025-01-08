module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Eliminar todas las claves foráneas conflictivas
    await queryInterface.removeConstraint(
      'outgoingshipmentproducts',
      'OutgoingShipmentProducts_pallet_product_id_fkey'
    ).catch(() => console.log('Constraint OutgoingShipmentProducts_pallet_product_id_fkey not found'));

    await queryInterface.removeConstraint(
      'outgoingshipmentproducts',
      'fk_outgoing_shipmentproducts_pallet_product_id'
    ).catch(() => console.log('Constraint fk_outgoing_shipmentproducts_pallet_product_id not found'));

    await queryInterface.removeConstraint(
      'outgoingshipmentproducts',
      'outgoingshipmentproducts_ibfk_1'
    ).catch(() => console.log('Constraint outgoingshipmentproducts_ibfk_1 not found'));

    await queryInterface.removeConstraint(
      'outgoingshipmentproducts',
      'fk_outgoing_shipmentproducts_outgoing_shipment_id'
    ).catch(() => console.log('Constraint fk_outgoing_shipmentproducts_outgoing_shipment_id not found'));

    // Añadir claves foráneas correctas
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
    // Restaurar las claves foráneas eliminadas
    await queryInterface.addConstraint('outgoingshipmentproducts', {
      fields: ['pallet_product_id'],
      type: 'foreign key',
      name: 'OutgoingShipmentProducts_pallet_product_id_fkey',
      references: {
        table: 'palletproducts',
        field: 'id',
      },
      onDelete: 'CASCADE',
    });

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
      name: 'outgoingshipmentproducts_ibfk_1',
      references: {
        table: 'outgoingshipments',
        field: 'id',
      },
      onDelete: 'CASCADE',
    });
  },
};
