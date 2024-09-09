'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Agregar la relación con PurchaseOrderProductReasons y nuevos campos a PurchaseOrderProducts
    await queryInterface.addColumn('PurchaseOrderProducts', 'reason_id', {
      type: Sequelize.INTEGER,
      references: {
        model: 'PurchaseOrderProductReasons', // Nombre de la tabla a la que referencia
        key: 'id'
      },
      allowNull: true, // Puedes ajustar a false si siempre es necesario tener un motivo
      onDelete: 'SET NULL' // Opción a modificar según el comportamiento deseado
    });

    await queryInterface.addColumn('PurchaseOrderProducts', 'quantity_received', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    await queryInterface.addColumn('PurchaseOrderProducts', 'quantity_missing', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    // Renombrar la columna quantity a quantity_purchased
    await queryInterface.renameColumn('PurchaseOrderProducts', 'quantity', 'quantity_purchased');

    // Agregar índices para mejorar el rendimiento de búsqueda
    await queryInterface.addIndex('PurchaseOrderProducts', ['reason_id']);
    await queryInterface.addIndex('PurchaseOrderProducts', ['product_id']);
    await queryInterface.addIndex('PurchaseOrderProducts', ['purchase_order_id']);
  },

  async down(queryInterface, Sequelize) {
    // Quitar las columnas añadidas en caso de hacer rollback
    await queryInterface.removeColumn('PurchaseOrderProducts', 'reason_id');
    await queryInterface.removeColumn('PurchaseOrderProducts', 'quantity_received');
    await queryInterface.removeColumn('PurchaseOrderProducts', 'quantity_missing');

    // Volver a renombrar la columna quantity_purchased a quantity
    await queryInterface.renameColumn('PurchaseOrderProducts', 'quantity_purchased', 'quantity');

    // Eliminar índices
    await queryInterface.removeIndex('PurchaseOrderProducts', ['reason_id']);
    await queryInterface.removeIndex('PurchaseOrderProducts', ['product_id']);
    await queryInterface.removeIndex('PurchaseOrderProducts', ['purchase_order_id']);
  }
};