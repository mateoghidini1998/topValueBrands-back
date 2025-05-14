const { QueryTypes } = require("sequelize");
const { Product, AmazonProductDetail, WalmartProductDetail, sequelize } = require("../models");

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
    SELECT 
      p.id, 
      p.product_name, 
      p.product_cost, 
      p.product_image, 
      p.supplier_item_number, 
      p.supplier_id, 
      p.upc,
      s.supplier_name,
      p.pack_type,
      p.warehouse_stock,
      p.is_active,
      p.in_seller_account,
      p.warehouse_stock AS amazon_warehouse_stock,
      
      -- Datos de AmazonProductDetail
      apd.ASIN AS amazon_asin,
      apd.seller_sku AS amazon_seller_sku,
      apd.FBA_available_inventory AS amazon_fba_available_inventory,
      apd.reserved_quantity AS amazon_reserved_quantity,
      apd.Inbound_to_FBA AS amazon_inbound_to_fba,
      apd.dangerous_goods AS dangerous_goods,
      apd.is_hazmat AS is_hazmat,
      apd.hazmat_value AS hazmat_value,
      apd.updatedAt AS amazon_updatedAt,
      apd.isActiveListing AS isActiveListing,
      apd.fc_transfer AS fc_transfer,
      apd.fc_processing AS fc_processing,
      apd.customer_order AS customer_order,

      
      -- Datos de WalmartProductDetail
      wpd.available_to_sell_qty AS walmart_available_to_sell_qty,
      wpd.price AS walmart_price,
      wpd.gtin AS walmart_gtin,
      wpd.seller_sku AS walmart_seller_sku,
      wpd.updatedAt AS walmart_updatedAt

    FROM products p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    LEFT JOIN amz_product_details apd ON p.id = apd.product_id
    LEFT JOIN wmt_product_details wpd ON p.id = wpd.product_id
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
    SELECT COUNT(*) AS total 
    FROM products p
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

const CreateAmazonProductDetail = async (productDetailData) => {
  return await AmazonProductDetail.create(productDetailData);
};

const CreateWalmartProductDetail = async (productDetailData) => {
  return await WalmartProductDetail.create(productDetailData);
}

const DeleteProduct = async (id) => {
  return await Product.update({ is_active: 0 }, { where: { id } });
}

const UpdateProductDgType = async (id, dgType) => {
  return await Product.update(
    { dangerous_goods: dgType },
    { where: { id } }
  );
};


module.exports = {
  FindAllProducts,
  FindProductById,
  CreateProduct,
  CreateAmazonProductDetail,
  CreateWalmartProductDetail,
  DeleteProduct,
  UpdateProductDgType
};
