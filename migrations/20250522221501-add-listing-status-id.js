'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'listing_status_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'listings_status',
        key: 'id'
      },
      defaultValue: 1
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('products', 'listing_status_id');
  }
}; 