const express = require('express');
const asyncHandler = require('../middlewares/async')
const axios = require('axios');
const { User } = require('../models');
const { Product } = require('../models');
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv');

dotenv.config({
    path: './.env'
})

// Create a function to Update the products
exports.addExtraInfoToProduct = asyncHandler(async (req, res) => {
    // check if the user is admin
    if (req.user.role !== 'admin') {
        return res.status(401).json({ msg: 'Unauthorized' });
    }

    // check if the product exists
    const product = await Product.findOne({ where: { seller_sku: req.body.seller_sku} });
    if (!product) {
        return res.status(404).json({ msg: 'Product not found' });
    }

    try {
        // add the supplier info to the product
        product.supplier_name = req.body.supplier_name;
        product.supplier_item_number = req.body.supplier_item_number;
        product.product_cost = req.body.product_cost;
        product.pack_type = req.body.pack_type;
        // save the product
        await product.save();
        res.status(200).json(product);
    } catch (error) {
        console.error({ msg: error.message })
    }
})

// Create a function to Update the is_active as a toggle field of products looking the product by ASIN and seller_sku
exports.toggleShowProduct = asyncHandler(async (req, res) => {

    // Get user role to restrict access
    const user = await User.findOne({ where: { id: req.user.id } });
    console.log(user);
    if (user.role !== 'admin') {
        return res.status(401).json({ msg: 'Unauthorized' });
    }

    // Get the product by seller_sku to check if the product exists
    const product = await Product.findOne({ where: { seller_sku: req.body.seller_sku } });
    if (!product) {
        return res.status(404).json({ msg: 'Product not found' });
    }

    try {
        product.is_active = !product.is_active;
        await product.save();
        res.status(200).json(product);
    } catch (error) {
        console.error({ msg: error.message })
    }
})

exports.getProducts = asyncHandler(async (req, res) => {

    // Get user role to restrict access
    const user = await User.findOne({ where: { id: req.user.id } });

    if (user.role !== 'admin') {
        return res.status(401).json({ msg: 'Unauthorized' });
    }

    const products = await Product.findAll();

    return res.status(200).json({
        success: true,
        total: products.length,
        data: products
    })
})

