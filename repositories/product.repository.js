const { QueryTypes } = require("sequelize");
const { Product, sequelize } = require("../models");

const FindAllProducts = async ({
  whereClause,
  replacements,
  orderBy,
  orderWay,
  limit,
  offset,
}) => {
  const products = await sequelize.query(
    `
    SELECT p.id, p.product_name, p.product_cost, p.seller_sku, p.ASIN, p.updatedAt, p.product_image, p.supplier_item_number, p.pack_type, p.warehouse_stock, p.FBA_available_inventory, p.reserved_quantity, p.Inbound_to_FBA, p.in_seller_account, p.is_active, p.supplier_id, p.upc,
           s.supplier_name
    FROM products p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    ${whereClause}
    ORDER BY ${orderBy} ${orderWay}
    LIMIT :limit OFFSET :offset
  `,
    {
      replacements: { ...replacements, limit, offset },
      type: QueryTypes.SELECT,
    }
  );

  const countResult = await sequelize.query(
    `
    SELECT COUNT(*) AS total FROM products p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    ${whereClause}
  `,
    {
      replacements,
      type: QueryTypes.SELECT,
    }
  );

  return {
    products,
    total: countResult[0].total,
  };
};

const FindProductById = async (id) => {
  return await Product.findByPk(id);
};

const CreateProduct = async (productData) => {
  return await Product.create(productData);
};

const DeleteProduct = async (id) => {
  return await Product.update({ is_active: 0 }, { where: { id } });
}

module.exports = {
  FindAllProducts,
  FindProductById,
  CreateProduct,
  DeleteProduct
};
