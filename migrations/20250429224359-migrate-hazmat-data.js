'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {

    await queryInterface.addColumn('Amz_Product_Details', 'hazmat_value', {
      type: Sequelize.STRING,
      defaultValue: "STANDARD",
      allowNull: true,
    });

    await queryInterface.addColumn("Amz_Product_Details", "is_hazmat", {
      type: Sequelize.BOOLEAN,
      defaultValue: null,
      allowNull: true,
    });

    await queryInterface.addColumn('Amz_Product_Details', 'dangerous_goods', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    const [products] = await queryInterface.sequelize.query(
      'SELECT id, dangerous_goods, is_hazmat, hazmat_value FROM Products'
    );

    for (const product of products) {
      await queryInterface.sequelize.query(
        `
        UPDATE Amz_Product_Details
        SET 
          dangerous_goods = :dangerous_goods,
          is_hazmat = :is_hazmat,
          hazmat_value = :hazmat_value
        WHERE product_id = :product_id
        `,
        {
          replacements: {
            dangerous_goods: product.dangerous_goods,
            is_hazmat: product.is_hazmat,
            hazmat_value: product.hazmat_value,
            product_id: product.id
          }
        }
      );
    }
    
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Amz_Product_Details', null, {});
  },
};
