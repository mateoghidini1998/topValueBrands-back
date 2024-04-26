const asyncHandler = require('../middlewares/async')
const { Product } = require('../models')
const dotenv = require('dotenv');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Readable } = require('stream');

dotenv.config({path: './.env'});

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

        if(responseData.compressionAlgorithm) {
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
        const csvFile = await this.downloadCSVReport(req, res, next);
        const results = [];

        const products = await new Promise((resolve, reject) => {
            fs.createReadStream(csvFile)
            .pipe(csv({ 
                separator: '\t\t',
                encoding: 'utf8',
             }))
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                // Send the JSON response to the client
                res.json(results);

                // Save products to the database asynchronously
                try {
                    await saveProductsToDatabase(results);
                } catch (error) {
                    console.error(error.message);
                }

                resolve(); // Resolve the promise when the stream ends
            })
            .on('error', (error) => {
                reject(error); // Reject the promise if there's an error
            });
        });

    } catch (error) {
        console.error(error.message);
        res.status(500).send('Internal Server Error');
    }
});



async function saveProductsToDatabase(inventorySummaries) {

    const products = await Promise.all(inventorySummaries.map(product => {
        return Product.create({
            ASIN: product.asin,
            product_name: product["product-name"],
            product_cost: product["your-price"],
            seller_sku: product.sku,
            FBA_available_inventory:product["afn-fulfillable-quantity"],
            FC_transfer: product["afn-reserved-quantity"],
            Inbound_to_FBA: product["afn-inbound-shipped-quantity"]
        });
    }));
    return products;
}

//Function to compare DB to new JSON Report
//1- Validate if JSON Report item SKU is in DB
//2- If not, add it to DB
//3- If yes, check if ASIN, product_name, product_cost, seller_sku, FBA_available_inventory, FC_transfer, Inbound_to_FBA are the same
//4- If not, update the DB item with the new values
//5- If yes, do nothing