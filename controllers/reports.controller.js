const asyncHandler = require('../middlewares/async')
const { Product } = require('../models')
const dotenv = require('dotenv');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Readable } = require('stream');
const readline = require('readline/promises');
const inventory = require('../data/NewInventory.json')

dotenv.config({ path: './.env' });

let reportId = ''

//@route   POST api/reports
//@desc    Generate new report
//@access  private

// Refactor createReport to return the reportId without sending a response
exports.createReport = asyncHandler(async (req, res, next) => {
    const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports`;

    const requestBody = {
        "reportType": "GET_FBA_MYI_ALL_INVENTORY_DATA",
        "marketplaceIds": [`${process.env.MARKETPLACE_US_ID}`],
        "custom": true
    };

    const response = await axios.post(url, requestBody, {
        headers: {
            'Content-Type': 'application/json',
            'x-amz-access-token': req.headers['x-amz-access-token']
        }
    });
    // Return the reportId instead of sending a response
    console.log('Reporte Generado...')
    return response.data.reportId;
});

const pollReportStatus = async (reportId, accessToken) => {
    const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports/${reportId}`;
    let reportStatus = '';
    while (reportStatus !== 'DONE') {
        const response = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json',
                'x-amz-access-token': accessToken
            }
        });
        reportStatus = response.data.processingStatus;
        console.log(reportStatus)
        // Wait for a short period before polling again to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds

    }
    return reportStatus;
};

// Use the reportId in getReportById to fetch and send the report
exports.getReportById = asyncHandler(async (req, res, next) => {
    // Call createReport and get the reportId
    const reportId = await this.createReport(req, res, next);
    const accessToken = req.headers['x-amz-access-token'];

    try {
        // Poll the report status until it's DONE
        await pollReportStatus(reportId, accessToken);

        const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports/${reportId}`;
        console.log('URL: ', url);

        const reportResponse = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json',
                'x-amz-access-token': accessToken
            }
        });

        // Send the report response
        console.log('Obtuvimos el reporte')
        return reportResponse.data
    } catch (error) {
        console.error('Error fetching report:', error);
        // Send an error response
        res.status(500).json({ message: 'Error fetching report' });
    }
});

exports.generateReport = asyncHandler(async (req, res, next) => {
    reportId = await this.getReportById(req, res, next);
    let documentId = reportId.reportDocumentId;
    const response = await axios.get(`${process.env.AMZ_BASE_URL}/reports/2021-06-30/documents/${documentId}`, {
        headers: {
            'Content-Type': 'application/json',
            'x-amz-access-token': req.headers['x-amz-access-token']
        }
    });
    let documentUrl = response.data.url;
    console.log('Se genero el documento del reporte')
    return documentUrl;
});

exports.downloadCSVReport = asyncHandler(async (req, res, next) => {
    try {
        let documentUrl = await this.generateReport(req, res, next);

        const response = await axios.get(documentUrl, {
            responseType: 'arraybuffer'
        });

        let responseData = response.data;

        if (responseData.compressionAlgorithm) {
            try {
                responseData = require('zlib').gunzipSync(responseData);
            } catch (error) {
                console.error(error.message);
                return res.status(500).send('Error while decompressing data');
            }
        }

        const csvDirectory = path.resolve('./reports');
        if (!fs.existsSync(csvDirectory)) {
            fs.mkdirSync(csvDirectory);
        }

        // Generate unique filename for CSV file
        const timestamp = Date.now();
        const csvFilename = `report_${timestamp}.csv`;
        const csvFilePath = path.join(csvDirectory, csvFilename);

        // Write CSV data to file
        fs.writeFileSync(csvFilePath, responseData);

        console.log('Se descargo el documento como CSV')
        return csvFilePath

    } catch (error) {
        console.error(error);
        return res.status(500).send('Internal Server Error');
    }
});

exports.sendCSVasJSON = asyncHandler(async (req, res, next) => {
    try {
        const csvFile = './reports/report_1714251644781.csv' /* await this.downloadCSVReport(req,res,next); */
        const results = [];
        let keys = [];

        const rl = readline.createInterface({
            input: fs.createReadStream(csvFile, { encoding: 'utf8' }),
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            if (!keys.length) {
                // La primera línea contiene los nombres de las claves
                keys = line.split('\t');
            } else {
                // Las siguientes líneas contienen los valores
                const values = line.split('\t');
                const obj = {};
                keys.forEach((key, index) => {
                    obj[key] = values[index];
                });
                results.push(obj);
            }
        }

        // Aquí puedes agregar el código para guardar los productos en la base de datos
         try {
             /* await saveProductsToDatabase(results); */
         } catch (error) {
             console.error(error.message);
        }

        res.json({count: results.length, items: results});
        return results;
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Internal Server Error');
    }
});

exports.syncDBWithAmazon = asyncHandler(async (req, res, next) => {
    try {
        // Call createReport and get the reportId
        const report = await this.sendCSVasJSON(req, res, next);

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

const processReport = async (productsArray) => {
    try {
        const updatedProducts = []; // Variable para almacenar los productos agregados y actualizados

        // Obtener todos los productos existentes en la base de datos
        const existingProducts = await Product.findAll();

        // Convertir los productos existentes a un objeto para facilitar la búsqueda
        const existingProductsMap = existingProducts.reduce((acc, product) => {
            acc[product.seller_sku] = product;
            return acc;
        }, {});

        // Iterar sobre el array de productos recibidos
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

                // Agregar el producto creado a la lista de productos actualizados
                updatedProducts.push(product);
            } else {
                // Si el producto existe, verificar si hay cambios y actualizar si es necesario
                const updates = {};
                if (existingProduct.product_name !== product["product-name"]) updates.product_name = product["product-name"];
                
                // Agregar más campos a verificar según sea necesario
                // Convertir otros valores numéricos a números antes de comparar
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
        // Retornar la lista de productos actualizados
        return { newSyncQuantity: updatedProducts.length, newSyncData: updatedProducts };
    } catch (error) {
        console.error('Error al actualizar o crear productos:', error);
        throw error; // Propagar el error para manejarlo en un nivel superior si es necesario
    }
};


async function saveProductsToDatabase(inventorySummaries) {

    const products = await Promise.all(inventorySummaries.map(product => {
        return Product.create({
            ASIN: product.asin,
            product_name: product["product-name"],
            seller_sku: product.sku,
            FBA_available_inventory: product["afn-fulfillable-quantity"],
            reserved_quantity: product["afn-reserved-quantity"],
            Inbound_to_FBA: product["afn-inbound-shipped-quantity"]
        });
    }));
    return products;
}

exports.importJSON = asyncHandler(async (req, res, next) => {
    try {
        for (const item of inventory) {
          await Product.update(
            {
              supplier_item_number: item.MPN,
              supplier_name: item.Supplier,
              product_cost: item['Cost '][ 'Unit'],
            },
            {
              where: {
                seller_sku: item.SKU,
              },
            }
          );
          console.log(`Actualizado el producto con ASIN: ${item.SKU}`);
        }
        return res.status(200).json({ message: 'Productos actualizados correctamente' });
     } catch (error) {
        console.error('Error al actualizar los productos:', error);
    }
});

//Function to compare DB to new JSON Report
//1- Validate if JSON Report item SKU is in DB
//2- If not, add it to DB
//3- If yes, check if ASIN, product_name, product_cost, seller_sku, FBA_available_inventory, reserved_quantity, Inbound_to_FBA are the same
//4- If not, update the DB item with the new values
//5- If yes, do nothing

