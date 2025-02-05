const productRepository = require('../repositories/product.repository');
const { getProductDetailsByASIN } = require('../utils/product_utils');
const supplierService = require('../services/supplier.service');

const createProduct = async (productData, accessToken) => {
  let product = await productRepository.FindProductById(productData.id);

  if (!accessToken) {
    console.log('No access token provided');
    throw new Error('No access token provided');
  }

  if (product) {
    if (!product.is_active) {
      const { productName, imageUrl } = await getProductDetailsByASIN(productData.ASIN, accessToken);

      productData.product_name = productName;
      productData.product_image = imageUrl || null;

      const requiredFields = ['product_cost', 'ASIN', 'supplier_id'];
      for (const field of requiredFields) {
        if (!productData[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      await productRepository.updateProduct(product.id, { ...productData, is_active: true });

      return { msg: 'Product reactivated and updated successfully', product };
    } else {
      throw new Error('Product already exists');
    }
  } else {
    const { productName, imageUrl } = await getProductDetailsByASIN(productData.ASIN, accessToken);

    productData.product_name = productName;
    productData.product_image = imageUrl || null;

    const requiredFields = ['product_cost', 'ASIN', 'supplier_id'];
    for (const field of requiredFields) {
      if (!productData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    let supplier = await supplierService.getSupplierById(productData.supplier_id);

    if (!supplier) {
      supplier = await supplierService.createSupplier(productData.supplier_id);
    }

    return await productRepository.CreateProduct(productData);
  }
};

const findAllProducts = async ({ page = 1, limit = 50, keyword = '', supplier, orderBy = 'updatedAt', orderWay = 'DESC' }) => {
  const offset = (page - 1) * limit;

  const allowedOrderBy = ['updatedAt', 'product_name', 'product_cost', 'supplier_item_number', 'pack_type', 'FBA_available_inventory', 'reserved_quantity', 'Inbound_to_FBA', 'warehouse_stock'];
  if (!allowedOrderBy.includes(orderBy)) orderBy = 'updatedAt';

  const allowedOrderWay = ['ASC', 'DESC'];
  if (!allowedOrderWay.includes(orderWay)) orderWay = 'DESC';

  let whereClause = "WHERE p.is_active = 1";
  let replacements = {};

  if (supplier) {
    whereClause += " AND p.supplier_id = :supplier";
    replacements.supplier = supplier;
  }

  if (keyword) {
    whereClause += ` AND (
      p.supplier_item_number LIKE :keyword OR 
      s.supplier_name LIKE :keyword OR 
      p.pack_type LIKE :keyword OR 
      p.product_cost LIKE :keyword OR 
      p.seller_sku LIKE :keyword OR 
      p.ASIN LIKE :keyword OR 
      p.product_name LIKE :keyword
    )`;
    replacements.keyword = `%${keyword}%`;
  }

  const { products, total } = await productRepository.FindAllProducts({
    whereClause,
    replacements,
    orderBy,
    orderWay,
    limit,
    offset,
  });

  return {
    total,
    pages: Math.ceil(total / limit),
    currentPage: page,
    data: products,
  };
};


module.exports = {
  createProduct,
  findAllProducts
};