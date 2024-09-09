'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Agregar la columna purchase_order_status_id
    await queryInterface.addColumn('PurchaseOrders', 'purchase_order_status_id', {
      type: Sequelize.INTEGER,
      references: {
        model: 'PurchaseOrderStatus', // Nombre de la tabla a la que referencia
        key: 'id'
      },
      allowNull: true, // Permitir nulos temporalmente durante la migración de los datos
    });

    // Mapeo de status a sus respectivos IDs
    const statusMap = {
      'Rejected': 1,
      'Pending': 2,
      'Good to go': 3,
      'Cancelled': 4,
      'In transit': 5,
      'Arrived': 6,
      'Closed': 7,
      'Waiting for supplier approval': 8
    };

    // Actualizar los datos existentes: reemplazar el texto de status con los IDs correspondientes
    for (const [status, id] of Object.entries(statusMap)) {
      await queryInterface.sequelize.query(
        `UPDATE PurchaseOrders SET purchase_order_status_id = ${id} WHERE status = '${status}'`
      );
    }

    // Ahora que se migraron los datos, podemos eliminar la columna status
    await queryInterface.removeColumn('PurchaseOrders', 'status');

    // Hacer que la columna purchase_order_status_id no permita valores nulos
    await queryInterface.changeColumn('PurchaseOrders', 'purchase_order_status_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'PurchaseOrderStatus',
        key: 'id'
      }
    });

    // Agregar un índice en purchase_order_status_id para optimizar las búsquedas
    await queryInterface.addIndex('PurchaseOrders', ['purchase_order_status_id']);
  },

  async down(queryInterface, Sequelize) {
    // Eliminar el índice
    await queryInterface.removeIndex('PurchaseOrders', ['purchase_order_status_id']);

    // Revertir el cambio: volver a agregar la columna status
    await queryInterface.addColumn('PurchaseOrders', 'status', {
      type: Sequelize.STRING,
      allowNull: false
    });

    // Mapeo inverso: devolver los IDs a sus valores de texto originales
    const statusMap = {
      1: 'Rejected',
      2: 'Pending',
      3: 'Good to go',
      4: 'Cancelled',
      5: 'In transit',
      6: 'Arrived',
      7: 'Closed',
      8: 'Waiting for supplier approval'
    };

    for (const [id, status] of Object.entries(statusMap)) {
      await queryInterface.sequelize.query(
        `UPDATE PurchaseOrders SET status = '${status}' WHERE purchase_order_status_id = ${id}`
      );
    }

    // Eliminar la columna purchase_order_status_id
    await queryInterface.removeColumn('PurchaseOrders', 'purchase_order_status_id');
  }
};
