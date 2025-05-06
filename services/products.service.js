const productRepository = require('../repositories/product.repository');
const { getProductDetailsByASIN } = require('../utils/product_utils');
const supplierService = require('../services/supplier.service');
const shipmentRepository = require('../repositories/shipment.repository');
const palletRepository = require('../repositories/pallet.repository');
const purchaseOrderRepository = require('../repositories/purchase-order.repository');
const logger = require('../logger/logger');
const { sequelize } = require("../models");

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

const findAllProducts = async ({ page = 1, limit = 50, keyword = '', supplier, orderBy = 'product_name', orderWay = 'ASC' }) => {
  const offset = (page - 1) * limit;

  const allowedOrderBy = ['product_name', 'product_cost', 'supplier_item_number', 'pack_type', 'FBA_available_inventory', 'reserved_quantity', 'Inbound_to_FBA', 'warehouse_stock', 'ASIN', 'seller_sku'];
  // if (!allowedOrderBy.includes(orderBy)) orderBy = 'p.updatedAt';

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
      apd.seller_sku LIKE :keyword OR 
      apd.ASIN LIKE :keyword OR 
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

  const cleanedProducts = products.map((product) => {
    const isAmazon = product.amazon_asin !== null;
    const isWalmart = product.walmart_gtin !== null;

    const base = {
      id: product.id,
      product_name: product.product_name,
      product_cost: product.product_cost,
      product_image: product.product_image,
      supplier_item_number: product.supplier_item_number,
      supplier_id: product.supplier_id,
      upc: product.upc,
      supplier_name: product.supplier_name,
      pack_type: product.pack_type,
      warehouse_stock: product.warehouse_stock,
      is_active: product.is_active,
      in_seller_account: product.in_seller_account,
      updatedAt: isAmazon ? product.amazon_updatedAt : product.walmart_updatedAt,
      marketplace: isAmazon && isWalmart ? "both" : isAmazon ? "amazon" : isWalmart ? "walmart" : null
    };

    if (isAmazon) {
      base.asin = product.amazon_asin,
        base.seller_sku = product.amazon_seller_sku,
        base.warehouse_stock = product.amazon_warehouse_stock,
        base.fba_available_inventory = product.amazon_fba_available_inventory,
        base.reserved_quantity = product.amazon_reserved_quantity,
        base.inbound_to_fba = product.amazon_inbound_to_fba,
        base.dangerous_goods = product.dangerous_goods,
        base.is_hazmat = product.is_hazmat,
        base.hazmat_value = product.hazmat_value

    }

    if (isWalmart) {
      base.available_to_sell_qty = product.walmart_available_to_sell_qty,
        base.price = product.walmart_price,
        base.gtin = product.walmart_gtin,
        base.seller_sku = product.walmart_seller_sku
    }

    return base;
  });

  return {
    total,
    pages: Math.ceil(total / limit),
    currentPage: page,
    data: cleanedProducts,
  };

};

const deleteProduct = async (id, accessToken) => {
  logger.info('Executing deleteProduct...', { productId: id });

  // Start a database transaction
  const transaction = await sequelize.transaction();

  try {
    // Validate access token
    if (!accessToken) {
      throw new Error('Access token is required');
    }

    // Find the product by ID within the transaction
    const product = await productRepository.FindProductById(id, { transaction });
    if (!product) {
      logger.warn('Product not found', { productId: id });
      throw new Error('Product not found');
    }

    // Check if the product has stock
    if (await productHasStock(product)) {
      logger.warn('Product has stock and cannot be deleted', { productId: id });
      throw new Error('Product has stock');
    }

    // Check for associated entities within the transaction
    const [purchaseOrdersCount, palletsCount, shipmentsCount] = await Promise.all([
      purchaseOrderRepository.FindPurchaseOrdersByProduct(id, { transaction }),
      palletRepository.FindPalletsAssociatedToProduct(id, { transaction }),
      shipmentRepository.FindAllShipmentsAssociatedToProduct(id, { transaction }),
    ]);

    if (purchaseOrdersCount > 0 || palletsCount > 0 || shipmentsCount > 0) {
      logger.warn('Product has associated entities and cannot be deleted', { productId: id });
      throw new Error('Product has associated purchase orders, pallets, or shipments');
    }

    // Delete the product within the transaction
    const deleteResult = await productRepository.DeleteProduct(id, { transaction });
    if (!deleteResult) {
      logger.error('Failed to delete product', { productId: id });
      throw new Error('Failed to delete product');
    }

    logger.info('Product deleted successfully', { productId: id });

    // Commit the transaction if all operations succeed
    await transaction.commit();
    logger.info('Transaction committed successfully', { productId: id });

    // Delete product from seller account (outside the transaction since it's an external API call)
    await deleteProductFromSellerAccount(product.seller_sku, accessToken);
    logger.info('Product deleted from seller account', { productId: id, sellerSku: product.seller_sku });

    // Update the product's in_seller_account state to false
    await updateProductInSellerAccountState(id, false);
    logger.info('Product in_seller_account state updated to false', { productId: id });

  } catch (error) {
    // Rollback the transaction in case of any error
    await transaction.rollback();
    logger.error('Error in deleteProduct - transaction rolled back', { productId: id, error: error.message });
    throw new Error(`Failed to delete product: ${error.message}`);
  }
};

const productHasStock = async (product) => {
  const { warehouse_stock, FBA_available_inventory, reserved_quantity, Inbound_to_FBA } = product;
  return warehouse_stock > 0 || FBA_available_inventory > 0 || reserved_quantity > 0 || Inbound_to_FBA > 0;
};

const deleteProductFromSellerAccount = async (sellerSku, accessToken) => {
  const sellerId = process.env.AWS_SELLER_ID || 'A2VYDBAL8BMVQK';
  const marketplaceIds = [process.env.MARKETPLACE_US_ID];
  const url = `https://sellingpartnerapi-na.amazon.com/listings/2021-08-01/items/${sellerId}/${sellerSku}?marketplaceIds=${marketplaceIds}&issueLocale=en_US`;

  const headers = {
    'Content-Type': 'application/json',
    'x-amz-access-token': accessToken,
  };

  try {
    const response = await fetch(url, { method: 'DELETE', headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.data;
  } catch (error) {
    logger.error('Error deleting product from seller account', { sellerSku, error: error.message });
    throw new Error(`Error deleting product from seller account: ${error.message}`);
  }
};

const updateProductInSellerAccountState = async (productId, inSellerAccount) => {
  const transaction = await sequelize.transaction(); // Start a new transaction for this operation

  try {
    const product = await productRepository.FindProductById(productId, { transaction });
    if (!product) {
      throw new Error('Product not found');
    }

    await product.update({ in_seller_account: inSellerAccount }, { transaction });

    // Commit the transaction
    await transaction.commit();
    logger.info('Product in_seller_account state updated successfully', { productId, inSellerAccount });
  } catch (error) {
    // Rollback the transaction in case of any error
    await transaction.rollback();
    logger.error('Error updating product in_seller_account state', { productId, error: error.message });
    throw new Error(`Failed to update product in_seller_account state: ${error.message}`);
  }
};

const updateProductDgType = async (productId, dgType) => {
  const product = await productRepository.FindProductById(productId);

  if (!product) {
    throw new Error("Product not found");
  }

  await productRepository.UpdateProductDgType(productId, dgType);

  return { message: "Product updated successfully" };
};


module.exports = {
  createProduct,
  findAllProducts,
  deleteProduct,
  updateProductDgType
};