'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Products', 'dangerous_goods');
    await queryInterface.removeColumn('Products', 'is_hazmat');
    await queryInterface.removeColumn('Products', 'hazmat_value');

    await queryInterface.removeColumn('Wmt_Product_Details', 'pack_type');
    await queryInterface.removeColumn('Wmt_Product_Details', 'is_active');
    await queryInterface.removeColumn('Wmt_Product_Details', 'in_seller_account');
    
    await queryInterface.removeColumn('Amz_Product_Details', 'pack_type');
    await queryInterface.removeColumn('Amz_Product_Details', 'is_active');
    await queryInterface.removeColumn('Amz_Product_Details', 'in_seller_account');
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.addColumn('Products', 'dangerous_goods', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('Products', 'is_hazmat', {
      type: Sequelize.BOOLEAN,
      defaultValue: null,
      allowNull: true,
    });

    await queryInterface.addColumn('Products', 'hazmat_value', {
      type: Sequelize.STRING,
      defaultValue: "STANDARD",
      allowNull: true,
    });

    await queryInterface.addColumn('Wmt_Product_Details', 'pack_type', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Wmt_Product_Details', 'is_active', {
      allowNull: true,
      type: Sequelize.BOOLEAN,
      defaultValue: true,
    });
    await queryInterface.addColumn('Wmt_Product_Details', 'in_seller_account', {
      allowNull: true,
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
    
    await queryInterface.addColumn('Amz_Product_Details', 'pack_type', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Amz_Product_Details', 'is_active', {
      allowNull: true,
      type: Sequelize.BOOLEAN,
      defaultValue: true,
    });
    await queryInterface.addColumn('Amz_Product_Details', 'in_seller_account', {
      allowNull: true,
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
  }
};
