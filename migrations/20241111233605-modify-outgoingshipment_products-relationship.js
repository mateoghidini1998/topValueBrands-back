'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    // Intentar eliminar la clave foránea solo si existe
    try {
      await queryInterface.removeConstraint(
        'OutgoingShipmentProducts', 
        'OutgoingShipmentProducts_purchase_order_product_id_fkey'
      );
    } catch (error) {
      console.log("La restricción 'OutgoingShipmentProducts_purchase_order_product_id_fkey' no existe, continuando con la migración.");
    }
    
    // Renombrar la columna
    await queryInterface.renameColumn(
      'OutgoingShipmentProducts',
      'purchase_order_product_id',
      'pallet_product_id'
    );
    
    // Crear la nueva clave foránea
    await queryInterface.addConstraint('OutgoingShipmentProducts', {
      fields: ['pallet_product_id'],
      type: 'foreign key',
      name: 'OutgoingShipmentProducts_pallet_product_id_fkey',
      references: {
        table: 'PalletProducts',
        field: 'id',
      },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface, Sequelize) {
    // Eliminar la clave foránea recientemente agregada
    await queryInterface.removeConstraint(
      'OutgoingShipmentProducts', 
      'OutgoingShipmentProducts_pallet_product_id_fkey'
    );

    // Revertir el nombre de la columna
    await queryInterface.renameColumn(
      'OutgoingShipmentProducts',
      'pallet_product_id',
      'purchase_order_product_id'
    );

    // Restaurar la relación original con PurchaseOrderProducts
    await queryInterface.addConstraint('OutgoingShipmentProducts', {
      fields: ['purchase_order_product_id'],
      type: 'foreign key',
      name: 'OutgoingShipmentProducts_purchase_order_product_id_fkey',
      references: {
        table: 'PurchaseOrderProducts',
        field: 'id',
      },
      onDelete: 'CASCADE',
    });
  },
};
