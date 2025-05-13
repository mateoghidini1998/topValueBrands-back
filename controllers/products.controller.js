const express = require('express');
const asyncHandler = require('../middlewares/async');
const axios = require('axios');
const { Supplier, TrackedProduct, Product, SupressedListing, AmazonProductDetail, WalmartProductDetail } = require('../models');
const dotenv = require('dotenv');
const productService = require('../services/products.service');

dotenv.config({
  path: './.env',
});

//@route    POST api/products/add
//@desc     Create a product
//@access   Private
exports.createProduct = asyncHandler(async (req, res) => {
  try {
    const accessToken = req.headers['x-amz-access-token'];
    const productData = req.body;

    const newProduct = await productService.createProduct(productData, accessToken);

    res.status(201).json(newProduct);
  } catch (error) {
    res.status(400).json({ msg: error.message });
  }
});

//@route    PATCH api/products/addExtraInfoToProduct
//@desc     Update product
//@access   Private
exports.addExtraInfoToProduct = asyncHandler(async (req, res) => {
  const {
    id,
    product_name,
    product_image,
    supplier_id,
    supplier_item_number,
    product_cost,
    pack_type,
    ASIN,
    gtin,
    seller_sku,
    upc
  } = req.body;

  const product = await Product.findOne({
    where: { id },
    include: [
      {
        model: AmazonProductDetail,
        as: 'AmazonProductDetail',
        attributes: ['id', 'ASIN', 'seller_sku', 'FBA_available_inventory', 'reserved_quantity', 'Inbound_to_FBA']
      },
      {
        model: WalmartProductDetail,
        as: 'WalmartProductDetail',
        attributes: ['id', 'gtin', 'seller_sku']
      }
    ]
  });

  if (!product) {
    return res.status(404).json({ msg: 'Product not found' });
  }

  const supplier = await Supplier.findByPk(supplier_id);
  if (supplier_id && !supplier) {
    return res.status(404).json({ msg: 'Supplier not found' });
  }

  try {
    product.product_name = product_name;
    product.product_image = product_image;
    product.supplier_id = supplier_id;
    product.supplier_item_number = supplier_item_number;
    product.product_cost = product_cost;
    product.pack_type = pack_type;
    product.upc = upc || null;
    await product.save();

    if (product.AmazonProductDetail) {
      if (ASIN !== undefined) {
        product.AmazonProductDetail.ASIN = ASIN;
        product.AmazonProductDetail.seller_sku = seller_sku;
      };

      await product.AmazonProductDetail.save();
    }

    if (product.WalmartProductDetail) {
      if (gtin !== undefined) {
        product.WalmartProductDetail.gtin = gtin
        product.WalmartProductDetail.seller_sku = seller_sku;
      };
      await product.WalmartProductDetail.save();
    }

    const trackedProduct = await TrackedProduct.findOne({ where: { product_id: id } });
    if (trackedProduct) {
      trackedProduct.profit = trackedProduct.lowest_fba_price - trackedProduct.fees - product.product_cost;
      await trackedProduct.save();
    }

    res.status(200).json({ msg: 'Product updated successfully', product });
  } catch (error) {
    console.error({ msg: error.message });
    res.status(500).json({ msg: 'Internal server error' });
  }
});


//@route    DELETE api/products/:id
//@desc     Delete product
//@access   Private
exports.deleteProduct = asyncHandler(async (req, res) => {
  try {
    const accessToken = req.headers['x-amz-access-token'];
    const { id } = req.params;
    await productService.deleteProduct(id, accessToken);

    return res.status(204).json({});

  } catch (error) {
    res.status(400).json({ msg: error.message });
  }
});

//@route    PATCH api/products/disable
//@desc     Update is_active as a toggle field of products
//@access   Private
exports.toggleShowProduct = asyncHandler(async (req, res) => {

  const accessToken = req.headers['x-amz-access-token'];
  const productId = req.body.id;

  const product = await Product.findOne({
    where: { id: req.body.id },
  });
  const warehouse_stock = product.warehouse_stock;
  const fba_stock = product.FBA_available_inventory;
  const reserved_quantity = product.reserved_quantity;
  const inbound_to_fba = product.Inbound_to_FBA;

  if (!product) {
    return res.status(404).json({ msg: 'Product not found' });
  }

  if (warehouse_stock > 0 || fba_stock > 0 || reserved_quantity > 0 || inbound_to_fba > 0) {
    return res.status(400).json({ msg: 'Product has stock' });
  }

  const trackedProduct = await TrackedProduct.findOne({ where: { product_id: req.body.id } });

  try {
    product.is_active = !product.is_active;
    await product.save();

    if (trackedProduct) {
      trackedProduct.is_active = !trackedProduct.is_active;
      const deletedProduct = await trackedProduct.save();

      // If the products was deleted successfully, return the deleted product
      if (deletedProduct) {
        console.log(deletedProduct)
        await productService.deleteProduct(productId, accessToken);
      }

    }



    res.status(200).json(product);
  } catch (error) {
    console.error({ msg: error.message });
  }
});

//@route    GET api/products/
//@desc     Get products
//@access   Private
exports.getProducts = asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10000 || parseInt(req.query.limit) || 50;
    const keyword = req.query.keyword || '';
    const supplier = req.query.supplier || null;
    const orderBy = req.query.orderBy;
    const orderWay = req.query.orderWay;

    const products = await productService.findAllProducts({ page, limit, keyword, supplier, orderBy, orderWay });
    return res.status(200).json({
      success: true,
      ...products,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: 'Error fetching products',
      error: error.message,
    });
  }
});


exports.getSupressedListings = asyncHandler(async (req, res) => {
  try {
    const response = await SupressedListing.findAll();

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    res.status(400).json({ msg: error.message });
  }
});


const addImageToProducts = async (products, accessToken) => {
  const delay = 2000;
  const maxRequests = 5;
  let index = 0;

  const productsWithoutImage = [];
  let errorCount = 0;
  let error429Count = 0;
  let error403Count = 0;

  const fetchProductImage = async () => {
    const remainingProducts = products.slice(index, index + maxRequests);

    for (const product of remainingProducts) {
      const { ASIN } = product;
      const urlImage = `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items/${ASIN}?marketplaceIds=${'ATVPDKIKX0DER'}&includedData=images`;

      try {
        const response = await axios.get(urlImage, {
          headers: {
            'Content-Type': 'application/json',
            'x-amz-access-token': accessToken,
          },
        });
        const imageLinks = response.data.images[0].images;
        const image =
          imageLinks.find(
            (image) => image.width === 75 || image.height === 75
          ) || imageLinks[0];

        await Product.update(
          { product_image: image.link },
          { where: { ASIN: ASIN } }
        );
      } catch (error) {
        errorCount++;

        if (error.response) {
          switch (error.response.status) {
            case 404:
              break;
            case 403:
              error403Count++;
              break;
            case 429:
              error429Count++;
              break;
            default:
              console.error({ msg: error.message });
              break;
          }
        } else {
          console.error('Request error without response:', error.message);
        }

        productsWithoutImage.push(product);
      }
      index++;
    }

    if (index < products.length) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      await fetchProductImage();
    }
  };

  await fetchProductImage();

  return {
    addedSuccessfully: products.length - errorCount,
    error404: productsWithoutImage.length,
    error403: error403Count,
    error429: error429Count,
    productsWithoutImage: productsWithoutImage,
  };
};

exports.addImageToNewProducts = asyncHandler(async (accessToken) => {
  const newProducts = await Product.findAll({
    where: { product_image: null } || { product_image: '' },
  });

  const result = await addImageToProducts(newProducts, accessToken);
  return result;
});


exports.addUPCToPOProduct = async (product, upc) => {

  if (!upc || upc.trim() === '') {
    throw new Error(`Invalid UPC provided for product ${product.id}`);
  }
  product.upc = upc.trim();
  await product.save();

}

exports.addUPC = asyncHandler(async (req, res) => {
  const { upc } = req.body;
  const { id } = req.params;

  const product = await Product.findByPk(id);

  if (!product) {
    return res.status(404).json({ msg: 'Product not found' });
  }

  try {
    await exports.addUPCToPOProduct(product, upc);
    res.status(200).json({ msg: 'UPC added successfully' });
  } catch (error) {
    console.error({ msg: error.message });
    res.status(500).json({ msg: 'Error adding UPC to product' });
  }
})

exports.updateDGType = asyncHandler(async (req, res) => {

  const { productId } = req.params;
  const { dgType } = req.body;

  if (!dgType) {
    return res.status(400).json({ error: "dgType is required" });
  }

  try {
    const result = await productService.updateProductDgType(productId, dgType);
    return res.json(result);
  } catch (error) {
    return res.status(404).json({ error: error.message });
  }
});