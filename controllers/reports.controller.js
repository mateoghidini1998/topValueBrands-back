const asyncHandler = require('../middlewares/async');
const { Product } = require('../models');
const { sendCSVasJSON } = require('../utils/reports.utils');
const { sendOrderCSVasJSON } = require('../utils/pogenerator.utils')

//@route   POST api/reports
//@desc    Generate new report
//@access  private
exports.syncDBWithAmazon = asyncHandler(async (req, res, next) => {
    try {
        // Call createReport and get the reportId
        const report = await sendCSVasJSON(req, res, next);

        // Continue with the rest of the code after sendCSVasJSON has completed
        const newSync = await processReport(report);

        res.json(newSync);
        // return report; // Returning the report
        return newSync;

    } catch (error) {
        // Handle any errors
        next(error);
    }
});

exports.generateORderReport = asyncHandler(async (req, res, next) => {
    try {
        // Ensure that the response is only sent once
        const report = await sendOrderCSVasJSON(req, res, next);
        res.json({ report }); // Send the response here
    } catch (error) {
        // Handle any errors
        next(error);
    }
});


const processReport = async (productsArray) => {
    try {
        const updatedProducts = [];
        const newProducts = [];

        const existingProducts = await Product.findAll();

        const existingProductsMap = existingProducts.reduce((acc, product) => {
            acc[product.seller_sku] = product;
            return acc;
        }, {});

        for (const product of productsArray) {
            const existingProduct = existingProductsMap[product.sku];

            if (!existingProduct) {

                await Product.create({
                    ASIN: product.asin,
                    product_name: product["product-name"],
                    seller_sku: product.sku,
                    FBA_available_inventory: product["afn-fulfillable-quantity"],
                    reserved_quantity: product["afn-reserved-quantity"],
                    Inbound_to_FBA: product["afn-inbound-shipped-quantity"]
                });

                newProducts.push(product);
            } else {
                const updates = {};
                if (existingProduct.product_name !== product["product-name"]) updates.product_name = product["product-name"];

                const newFBAInventory = parseFloat(product["afn-fulfillable-quantity"]);
                if (existingProduct.FBA_available_inventory !== newFBAInventory) {
                    updates.FBA_available_inventory = newFBAInventory;
                }

                const newReservedQuantity = parseFloat(product["afn-reserved-quantity"]);
                if (existingProduct.reserved_quantity !== newReservedQuantity) {
                    updates.reserved_quantity = newReservedQuantity;
                }

                const newInboundToFBa = parseFloat(product["afn-inbound-shipped-quantity"]);
                if (existingProduct.Inbound_to_FBA !== newInboundToFBa) {
                    updates.Inbound_to_FBA = newInboundToFBa;
                }

                if (Object.keys(updates).length > 0) {
                    await Product.update(updates, {
                        where: { seller_sku: product.sku }
                    });
                    updatedProducts.push(product);
                }
            }
        }
        return { newSyncProductsQuantity: newProducts.length, newSyncQuantity: updatedProducts.length, newSyncProducts: newProducts, newSyncData: updatedProducts };
    } catch (error) {
        console.error('Error al actualizar o crear productos:', error);
        throw error; 
    }
};



