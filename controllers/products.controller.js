const express = require('express');
const asyncHandler = require('../middlewares/async');
const axios = require('axios');
const { Supplier, TrackedProduct, Product, SupressedListing } = require('../models');
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
  const product = await Product.findOne({
    where: { id: req.body.id },
  });
  if (!product) {
    return res.status(404).json({ msg: 'Product not found' });
  }

  const supplier = await Supplier.findByPk(req.body.supplier_id);

  if (req.supplier && !supplier) {
    return res.status(404).json({ msg: 'Supplier not found' });
  }

  try {
    product.product_name = req.body.product_name;
    product.product_image = req.body.product_image;
    product.ASIN = req.body.ASIN;
    product.seller_sku = req.body.seller_sku;

    product.supplier_id = req.body.supplier_id;
    product.supplier_item_number = req.body.supplier_item_number;
    product.product_cost = req.body.product_cost;

    const trackedProduct = await TrackedProduct.findOne({ where: { product_id: req.body.id } });
    if (trackedProduct) {
      trackedProduct.profit = trackedProduct.lowest_fba_price - trackedProduct.fees - product.product_cost;
      await trackedProduct.save();
    }

    product.pack_type = req.body.pack_type;
    product.FBA_available_inventory = req.body.FBA_available_inventory;
    product.reserved_quantity = req.body.reserved_quantity;
    product.Inbound_to_FBA = req.body.Inbound_to_FBA;

    await product.save();

    res.status(200).json(product);
  } catch (error) {
    console.error({ msg: error.message });
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
      await trackedProduct.save();
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
    const orderBy = req.query.orderBy || 'updatedAt';
    const orderWay = req.query.orderWay || 'DESC';

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