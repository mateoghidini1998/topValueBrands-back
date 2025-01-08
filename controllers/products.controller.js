const express = require('express');
const asyncHandler = require('../middlewares/async');
const axios = require('axios');
const { Supplier, TrackedProduct, Product, User } = require('../models');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { where, Op } = require('sequelize');
const req = require('express/lib/request');

dotenv.config({
  path: './.env',
});

//@route    POST api/products/add
//@desc     Create a product
//@access   Private
exports.createProduct = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(401).json({ msg: 'Unauthorized' });
  }

  const product = await Product.findOne({
    where: { ASIN: req.body.ASIN },
  });
  if (product) {
    return res.status(400).json({ msg: 'Product already exists' });
  
  } else {  
    const accessToken = req.headers['x-amz-access-token']
    const productName = await getProductNameByASIN(req.body.ASIN, req.headers['x-amz-access-token']);
    req.body.product_name = productName;

    const productImage = await getImageForProduct(req.body.ASIN, accessToken);
    req.body.product_image = productImage || null;
  }

  const requiredFields = [
    'product_cost',
    'ASIN',
    'supplier_item_number',
    'supplier_id',
  ];

  for (const field of requiredFields) {
    if (!req.body[field]) {
      return res.status(400).json({ msg: `Missing required field: ${field}` });
    }
  }

  const supplier = await Supplier.findByPk(req.body.supplier_id);

  if (!supplier) {
    let newSupplier = await Supplier.findOne({
      where: { supplier_name: 'Unknown' },
    });

    if (!newSupplier) {
      newSupplier = await Supplier.create({
        supplier_name: 'Unknown',
      });
    }
    req.body.supplier_id = newSupplier.id;
    req.body.in_seller_account = false;
  }

  try {
    const newProduct = await Product.create(req.body);
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(400).json({ msg: error.message });
  }
});

//@route    PATCH api/products/addExtraInfoToProduct
//@desc     Update product
//@access   Private
exports.addExtraInfoToProduct = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(401).json({ msg: 'Unauthorized' });
  }

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
    console.log(trackedProduct);
    if (trackedProduct) {
      trackedProduct.profit = trackedProduct.lowest_fba_price - trackedProduct.fees - product.product_cost;
      await trackedProduct.save();
    }

    product.pack_type = req.body.pack_type;
    product.FBA_available_inventory = req.body.FBA_available_inventory;
    product.reserved_quantity = req.body.reserved_quantity;
    product.Inbound_to_FBA = req.body.Inbound_to_FBA;


    // save the product
    await product.save();

    // await invalidateProductCache();

    res.status(200).json(product);
  } catch (error) {
    console.error({ msg: error.message });
  }
});

//@route    PATCH api/products/disable
//@desc     Update is_active as a toggle field of products
//@access   Private
exports.toggleShowProduct = asyncHandler(async (req, res) => {
  const user = await User.findOne({ where: { id: req.user.id } });

  if (user.role !== 'admin') {
    return res.status(401).json({ msg: 'Unauthorized' });
  }
  const product = await Product.findOne({
    where: { id: req.body.id },
  });
  if (!product) {
    return res.status(404).json({ msg: 'Product not found' });
  }

  const trackedProduct = await TrackedProduct.findOne({ where: { product_id: req.body.id } });

  try {
    product.is_active = !product.is_active;
    await product.save();

    if (trackedProduct) {
      trackedProduct.is_active = !trackedProduct.is_active;
      await trackedProduct.save();
    }


    // await invalidateProductCache();

    res.status(200).json(product);
  } catch (error) {
    console.error({ msg: error.message });
  }
});

//@route    GET api/products/
//@desc     Get products
//@access   Private
exports.getProducts = asyncHandler(async (req, res) => {
  const user = await User.findOne({ where: { id: req.user.id } });
  if (user.role !== 'admin') {
    return res.status(401).json({ msg: 'Unauthorized' });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const keyword = req.query.keyword || '';
  const supplier = req.query.supplier || null;
  const orderBy = req.query.orderBy || 'supplier_item_number';
  const orderWay = req.query.orderWay || 'ASC';

  const includeSupplier = {
    model: Supplier,
    as: 'supplier',
    attributes: ['supplier_name'],
  };

  const whereConditions = {
    is_active: true,
  };

  if (keyword) {
    whereConditions[Op.or] = [
      { supplier_item_number: { [Op.like]: `${keyword}%` } },
      { '$supplier.supplier_name$': { [Op.like]: `${keyword}%` } },
      { pack_type: { [Op.like]: `%${keyword}%` } },
      { product_cost: { [Op.like]: `${keyword}%` } },
      { seller_sku: { [Op.like]: `${keyword}%` } },
      { ASIN: { [Op.like]: `${keyword}%` } },
      { product_name: { [Op.like]: `${keyword}%` } },
    ];
  }

  if (supplier) {
    whereConditions.supplier_id = supplier;
  }

  try {
    const products = await Product.findAndCountAll({
      offset,
      limit,
      order: [[orderBy, orderWay]],
      where: whereConditions,
      include: [includeSupplier],
    });

    const totalPages = Math.ceil(products.count / limit);

    return res.status(200).json({
      success: true,
      total: products.count,
      pages: totalPages,
      currentPage: page,
      data: products.rows,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: 'Error fetching products',
      error: error.message,
    });
  }
});

// Get a product by seller_sku
// @route GET api/products/:sellerSku
// @access Public
exports.getProductBySellerSku = asyncHandler(async (req, res) => {
  const product = await Product.findOne({
    where: { seller_sku: req.params.seller_sku },
  });
  if (!product) {
    return res.status(404).json({ msg: 'Product not found' });
  }
  res.status(200).json(product);
});

exports.addImageToAllProducts = asyncHandler(async (req, res) => {
  const products = await Product.findAll();
  const delay = 2000;
  const maxRequests = 5;
  let index = 1000;
  const accessToken = req.headers['x-amz-access-token'];

  const fetchProductImage = async () => {
    const remainingProducts = products.slice(index, index + maxRequests);
    for (const product of remainingProducts) {
      const { ASIN } = product;
      const urlImage = `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items/${ASIN}?marketplaceIds=ATVPDKIKX0DER&includedData=images`;

      try {
        const response = await axios.get(urlImage, {
          headers: {
            'Content-Type': 'application/json',
            'x-amz-access-token': accessToken,
          },
        });
        const imageLink = response.data.images[0].images[0].link;
        const imageLinks = response.data.images[0].images;

        const image =
          imageLinks.find(
            (image) => image.width === 75 || image.height === 75
          ) || imageLinks[0];

        Product.update(
          { product_image: image.link },
          { where: { ASIN: ASIN } }
        );
      } catch (error) {
        console.error({ msg: error.message });
      }
      index++;
    }

    if (index < products.length) {
      setTimeout(fetchProductImage, delay);
    } else {
      res.json(products);
    }
  };

  fetchProductImage();
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

const getProductNameByASIN = asyncHandler(async (req, accessToken) => {
  console.log('ASIN: ' + req);
  console.log(accessToken);

  const ASIN = req;

  const url = `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items/${ASIN}?marketplaceIds=ATVPDKIKX0DER`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-access-token': accessToken,
      },
    });
    const productName = response.data.summaries[0].itemName;
    console.log(productName);
    // validate the product name
    return productName;
  } catch (error) {
    console.error({ msg: error.message });
    const productName = 'Product name not found';
    return productName;
  }

})

exports.addUPCToPOProduct = async (product, upc) => {

  // if (!product.upc) {
  if (!upc || upc.trim() === '') {
    throw new Error(`Invalid UPC provided for product ${product.id}`);
  }
  product.upc = upc.trim();
  await product.save();
  // } 
  // else {
  //   console.log(`Product ${product.id} already has a valid UPC: ${product.upc}`);
  //   throw new Error(`Product ${product.id} already has a valid UPC: ${product.upc}`);
  // }
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

const getImageForProduct = async (asin, accessToken) => {
  const url = `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items/${asin}?marketplaceIds=ATVPDKIKX0DER&includedData=images`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-access-token': accessToken,
      },
    });

    const imagesData = response.data.images;
    if (!imagesData || imagesData.length === 0) {
      console.warn(`No images found for ASIN: ${asin}`);
      return null;
    }

    const imageLinks = imagesData[0]?.images || [];
    const image =
      imageLinks.find((img) => img.width === 75 || img.height === 75) || imageLinks[0];
    return image?.link || null;
  } catch (error) {
    console.error({
      msg: error.message,
      response: error.response?.data || 'No response body',
      status: error.response?.status || 'No status code',
    });
    return null;
  }
}