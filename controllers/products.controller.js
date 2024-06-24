const express = require('express');
const asyncHandler = require('../middlewares/async');
const axios = require('axios');
const { User } = require('../models');
const { Supplier } = require('../models');
const { Product } = require('../models');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { where, Op } = require('sequelize');

dotenv.config({
  path: './.env',
});

//@route    POST api/products/add
//@desc     Create a product
//@access   Private
exports.createProduct = asyncHandler(async (req, res) => {
  // check if the user is admin
  if (req.user.role !== 'admin') {
    return res.status(401).json({ msg: 'Unauthorized' });
  }

  // check if the product exists
  const product = await Product.findOne({
    where: { seller_sku: req.body.seller_sku },
  });
  if (product) {
    return res.status(400).json({ msg: 'Product already exists' });
  }

  // check if there is missing any required fields from the array
  const requiredFields = [
    'seller_sku',
    'product_name',
    'ASIN',
  ];

  for (const field of requiredFields) {
    if (!req.body[field]) {
      return res.status(400).json({ msg: `Missing required field: ${field}` });
    }
  }

  // check if the supplier exists
  const supplier = await Supplier.findByPk(req.body.supplier_id);
  // if the supplier does not exist add the supplier Unknown
  if (!supplier) {
    // find the supplier with the name Unknown
    let newSupplier = await Supplier.findOne({
      where: { supplier_name: 'Unknown' },
    });

    // if the "Unknown" supplier does not exist, create it
    if (!newSupplier) {
      newSupplier = await Supplier.create({
        supplier_name: 'Unknown',
      });
    }

    req.body.supplier_id = newSupplier.id;
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
  // check if the user is admin
  if (req.user.role !== 'admin') {
    return res.status(401).json({ msg: 'Unauthorized' });
  }

  // check if the product exists
  const product = await Product.findOne({
    where: { seller_sku: req.body.seller_sku },
  });
  if (!product) {
    return res.status(404).json({ msg: 'Product not found' });
  }

  const supplier = await Supplier.findByPk(req.body.supplier_id);

  if (!supplier) {
    return res.status(404).json({ msg: 'Supplier not found' });
  }

  try {

    // add the product changes
    product.product_name = req.body.product_name;
    product.product_image = req.body.product_image;
    product.ASIN = req.body.ASIN;

    // add the supplier info to the product
    product.supplier_id = req.body.supplier_id;
    product.supplier_item_number = req.body.supplier_item_number;


    // add the product cost to the product
    product.product_cost = req.body.product_cost;
    product.pack_type = req.body.pack_type;

    // add the inventory stock info to the product
    product.FBA_available_inventory = req.body.FBA_available_inventory;
    product.reserved_quantity = req.body.reserved_quantity;
    product.Inbound_to_FBA = req.body.Inbound_to_FBA;


    // save the product
    await product.save();
    res.status(200).json(product);
  } catch (error) {
    console.error({ msg: error.message });
  }
});

//@route    PATCH api/products/disable
//@desc     Update is_active as a toggle field of products
//@access   Private
exports.toggleShowProduct = asyncHandler(async (req, res) => {
  // Get user role to restrict access
  const user = await User.findOne({ where: { id: req.user.id } });
  // console.log(user);
  if (user.role !== 'admin') {
    return res.status(401).json({ msg: 'Unauthorized' });
  }

  // Get the product by seller_sku to check if the product exists
  const product = await Product.findOne({
    where: { seller_sku: req.body.seller_sku },
  });
  if (!product) {
    return res.status(404).json({ msg: 'Product not found' });
  }

  try {
    product.is_active = !product.is_active;
    await product.save();
    res.status(200).json(product);
  } catch (error) {
    console.error({ msg: error.message });
  }
});

//@route    GET api/products/
//@desc     Get products
//@access   Private
exports.getProducts = asyncHandler(async (req, res) => {
  // Get user role to restrict access
  const user = await User.findOne({ where: { id: req.user.id } });

  if (user.role !== 'admin') {
    return res.status(401).json({ msg: 'Unauthorized' });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const keyword = req.query.keyword || '';
  let products = [];

  const includeSupplier = {
    model: Supplier,
    as: 'supplier',
    attributes: ['supplier_name'],
  };

  if (keyword) {
    products = await Product.findAll({
      order: [
        ['supplier_item_number', 'ASC'],
        ['product_cost', 'ASC'],
        [{ model: Supplier, as: 'supplier' }, 'supplier_name', 'ASC'],
        ['supplier_item_number', 'ASC'],
        ['pack_type', 'ASC'],
      ],
      where: {
        [Op.or]: [
          { supplier_item_number: { [Op.like]: `${keyword}%` } },
          { '$supplier.supplier_name$': { [Op.like]: `${keyword}%` } },
          { pack_type: { [Op.like]: `%${keyword}%` } },
          { product_cost: { [Op.like]: `${keyword}%` } },
          { seller_sku: { [Op.like]: `${keyword}%` } },
          { ASIN: { [Op.like]: `${keyword}%` } },
          { product_name: { [Op.like]: `${keyword}%` } },
        ],
        [Op.and]: [{ is_active: true }],
      },
      include: [includeSupplier],
    });
  } else {
    products = await Product.findAll({
      offset: offset,
      limit: limit,
      order: [
        ['supplier_item_number', 'ASC'],
        ['product_cost', 'ASC'],
        [{ model: Supplier, as: 'supplier' }, 'supplier_name', 'ASC'],
        ['supplier_item_number', 'ASC'],
        ['pack_type', 'ASC'],
      ],
      where: { is_active: true },
      include: [includeSupplier],
    });
  }

  const totalProducts =
    keyword !== '' ? products.length : await Product.count();
  const totalPages = Math.ceil(totalProducts / limit);

  return res.status(200).json({
    success: true,
    total: totalProducts,
    pages: totalPages,
    currentPage: page,
    data: products,
  });
});

// Function to add images to all products
exports.addImageToAllProducts = asyncHandler(async (req, res) => {
  const products = await Product.findAll();
  const delay = 2000; // Delay between requests in milliseconds
  const maxRequests = 5; // Maximum number of requests
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

        // Get the image from imageLinks where the width or the height is = 75;
        const image =
          imageLinks.find(
            (image) => image.width === 75 || image.height === 75
          ) || imageLinks[0];

        // console.log(image.link);
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
      // Log the number of requests made
      // console.log(`Se han realizado ${index} peticiones`);
      setTimeout(fetchProductImage, delay);
    } else {
      res.json(products);
    }
  };

  fetchProductImage();
});

const addImageToProducts = async (products, accessToken) => {
  const delay = 2000; // Delay between requests in milliseconds
  const maxRequests = 5; // Maximum number of requests
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
  // const user = await User.findOne({ where: { id: req.user.id } });
  // if (user.role !== 'admin') {
  //     return res.status(401).json({ msg: 'Unauthorized' });
  // }

  const newProducts = await Product.findAll({
    where: { product_image: null } || { product_image: '' },
  });
  // const accessToken = req.headers['x-amz-access-token'];

  const result = await addImageToProducts(newProducts, accessToken);

  return result;
});
